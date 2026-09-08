import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { callGateway } from "./wine-ai.functions";
import { MODELS } from "./ai-models";
import { matchesCountry, countryName } from "./countryMatch";

const MAX_WINES = 300;
const MAX_WISHLIST = 60;

function grapesToString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((g) =>
        typeof g === "string"
          ? g
          : g && typeof g === "object" && "name" in g
            ? String((g as { name: unknown }).name)
            : null,
      )
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\n?([\s\S]*?)\n?```/);
  const braced = text.match(/\{[\s\S]*\}/);
  const candidate = fenced?.[1] ?? braced?.[0] ?? text;
  try {
    return JSON.parse(candidate.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Google serves grounding citations from a redirect on its own host. Matching a
// substring anywhere in the URL let a model-supplied hostname such as
// grounding-api-redirect.example.com pass, so the check is on the hostname.
const GROUNDING_REDIRECT_HOSTS = ["vertexaisearch.cloud.google.com"];

function isGroundingRedirect(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return GROUNDING_REDIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const scopeSchema = z.enum(["cellar", "cellar_wishlist", "anything"]);
const localSchema = z.enum(["off", "preferred", "only"]);

function localLine(localMode: string, market: string | null) {
  // The prompt gets the country's name, not its ISO code: "the United States",
  // not "US". The code is an internal key and reads as noise to the model.
  const where = countryName(market) ?? market;
  if (localMode === "only") {
    return `HARD RULE: only wine produced in ${where} is acceptable. If nothing from ${where} suits this dish, say so in "gap" rather than substituting another country.`;
  }
  if (localMode === "preferred" && market) {
    return `The user is in ${where}, a wine producing country. Favour wine produced in ${where} where it genuinely suits the dish, but do not force it: if an imported style is clearly the better match, say so.`;
  }
  if (market) {
    return `The user is buying in ${where}. Only mention wine realistically available there at a normal retail price after import duties.`;
  }
  return "";
}

/* ------------------------------------------------------------------------ */
/* Call one: profile, grapes, cellar picks. No web access, so it returns fast */
/* and paints while the grounded call below is still running.                */
/* ------------------------------------------------------------------------ */

export const pairFromCellar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dish: z.string().trim().min(3).max(400),
        scope: scopeSchema,
        localMode: localSchema.default("off"),
        marketCountry: z.string().length(2).nullable().optional(),
        currency: z.string().min(1).max(4).default("USD"),
        priceMin: z.number().nonnegative().nullable().optional(),
        priceMax: z.number().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const includeWishlist = data.scope !== "cellar";
    const market = data.marketCountry?.toUpperCase() ?? null;

    const { data: wines, error } = await supabase
      .from("wines")
      .select(
        "id, wine_name, producer, vintage_year, wine_type, country, region, appellation, grape_varietals, alcohol_content, description, current_stock, price_per_bottle",
      )
      .is("archived_at", null)
      .gt("current_stock", 0)
      .limit(MAX_WINES);

    if (error) throw new Error(`Could not read cellar: ${error.message}`);

    // Price filtering happens here rather than in SQL so a bottle with no price
    // stays in the running and gets flagged. Gifts and old stock often have no
    // price, and disappearing from every search with no explanation is worse
    // than being shown as a loose match.
    const inBand = (price: number | null) => {
      if (price === null || price === undefined) return true;
      if (data.priceMin != null && price < data.priceMin) return false;
      if (data.priceMax != null && price > data.priceMax) return false;
      return true;
    };

    const isLocal = (country: string | null) => matchesCountry(country, market);

    let candidates = (wines ?? []).filter((w) => inBand(w.price_per_bottle));
    if (data.localMode === "only") candidates = candidates.filter((w) => isLocal(w.country));

    // Derived from the generated types rather than restated, so a schema change
    // surfaces here instead of drifting. A Record<string, unknown> is not
    // provably serializable and makes the whole return type fail.
    type WishlistRow = Pick<
      Database["public"]["Tables"]["wishlist"]["Row"],
      | "id"
      | "wine_name"
      | "producer"
      | "vintage_year"
      | "wine_type"
      | "country"
      | "region"
      | "grape_varietals"
    >;

    let wishlist: WishlistRow[] = [];
    if (includeWishlist) {
      const { data: rows } = await supabase
        .from("wishlist")
        .select("id, wine_name, producer, vintage_year, wine_type, country, region, grape_varietals")
        .limit(MAX_WISHLIST);
      wishlist = (rows ?? []).filter((w) =>
        data.localMode === "only" ? isLocal(w.country) : true,
      );
    }

    const cellarById = new Map(candidates.map((w) => [w.id, w]));
    const wishlistById = new Map(wishlist.map((w) => [w.id, w]));

    const cellarRows = candidates.map((w) => ({
      id: w.id,
      name: w.wine_name,
      producer: w.producer,
      vintage: w.vintage_year,
      type: w.wine_type,
      origin: [w.appellation, w.region, w.country].filter(Boolean).join(", ") || null,
      grapes: grapesToString(w.grape_varietals),
      abv: w.alcohol_content,
      stock: w.current_stock,
      price: w.price_per_bottle,
      note: w.description ? String(w.description).slice(0, 180) : null,
    }));

    const wishlistRows = wishlist.map((w) => ({
      id: w.id,
      name: w.wine_name,
      producer: w.producer,
      vintage: w.vintage_year,
      type: w.wine_type,
      origin: [w.region, w.country].filter(Boolean).join(", ") || null,
      grapes: grapesToString(w.grape_varietals),
    }));

    const currentYear = new Date().getFullYear();
    const money = data.currency;
    const band =
      data.priceMin != null || data.priceMax != null
        ? `They are spending roughly ${data.priceMin ?? 0} to ${data.priceMax ?? "any"} ${money} per bottle.`
        : `No price limit given.`;

    const prompt = `You are a sommelier advising one person about one meal.

They are cooking: ${data.dish}

Write every piece of prose you return in the same language the dish is written in. If the dish is in French, answer entirely in French. Wine terms, appellations and producer names keep their own spelling. This applies to profile.headline, profile.detail, every "why", "avoid", "gap", "region" and every follow-up question and option.

${band}
${localLine(data.localMode, market)}

CELLAR (bottles they own, in stock):
${JSON.stringify(cellarRows)}

${includeWishlist ? `WISHLIST (bottles they want but do NOT own):\n${JSON.stringify(wishlistRows)}` : ""}

Answer in layers, from general to specific.

1. "profile": what this dish asks of a wine, in wine terms and with no bottle named. Give {"headline": at most 8 words, e.g. "High acid, light body, no oak", "detail": one or two sentences explaining which parts of the dish drive that, naming fat, acid, sweetness, heat, smoke or texture}. Always fill this in, even when the cellar has nothing suitable. This is the part the user learns from.

2. "avoid": one sentence naming what actively ruins this dish and why, in wine terms. Be specific about the mechanism, not just the category. Return null only if nothing is genuinely worth warning about.

3. "grapes": 1 to 3 grape varieties or styles that express that profile. Each: {"grape", "why" (max 20 words), "region" (one or two regions known for it), "cellar_ids": ids from the CELLAR list above that are made from this grape or style, empty array if none}. Only use exact id strings from the list. This layer is about the kind of wine, not a specific bottle.

4. "picks": up to 3 bottles from CELLAR, ranked best first, identified ONLY by their exact "id" string. Never invent a bottle. Fewer than 3 is better than a weak third.
   Each: {"id", "rank", "why" (max 25 words, name the actual mechanism: acid, tannin, weight, sweetness, fat, smoke, spice), "serve" (Celsius range), "decant_minutes" (integer, 0 if none), "caution" (one short sentence or null)}.
   Use "caution" when the bottle looks too young to drink well (the current year is ${currentYear}, judge from vintage, type and origin) or when its price makes it extravagant for this dish.

${includeWishlist ? `5. "wishlist_picks": up to 2 entries from WISHLIST that suit this dish, as {"id", "why"}. They do not own these. Empty array if none fit.` : `5. "wishlist_picks": []`}

6. "gap": if the cellar genuinely does not serve this dish, one or two sentences on what is missing, in ${money}. Otherwise null.

7. "follow_ups": 2 or 3 short questions a sommelier would actually ask about THIS dish to sharpen the recommendation, each with 2 options. Derive them from the dish, never generic. For a blue cheese: how strong is it, young or piquant. For a curry: how hot. For a roast: what sauce. Shape: [{"question": "...", "options": ["...", "..."]}]. Each option must be a short phrase that reads naturally when appended to the dish description. Return an empty array only if the dish is already fully specified.

Never pad a list to fill a slot. An empty "picks" with a clear "profile" and "gap" is the right answer when the cellar does not suit the meal.

Return ONLY valid JSON, no markdown fences.`;

    const result = await callGateway({
      model: MODELS.FAST,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("No pairing returned by AI");
    const parsed = parseJsonBlock(text);

    const profileRaw = (parsed?.profile ?? null) as Record<string, unknown> | null;
    const profile = profileRaw
      ? {
          headline: String(profileRaw.headline ?? "").slice(0, 120),
          detail: String(profileRaw.detail ?? "").slice(0, 400),
        }
      : null;

    // Every id is checked against what we actually sent. Anything invented is
    // dropped here rather than shown as a bottle the user does not own.
    const seen = new Set<string>();
    const picks = (Array.isArray(parsed?.picks) ? parsed!.picks : [])
      .filter((p: Record<string, unknown>) => typeof p?.id === "string" && cellarById.has(p.id as string))
      .filter((p: Record<string, unknown>) =>
        seen.has(p.id as string) ? false : (seen.add(p.id as string), true),
      )
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          (Number(a.rank) || 99) - (Number(b.rank) || 99),
      )
      .slice(0, 3)
      .map((p: Record<string, unknown>) => {
        const wine = cellarById.get(p.id as string)!;
        return {
          wine,
          priceUnknown: wine.price_per_bottle === null || wine.price_per_bottle === undefined,
          why: String(p.why ?? "").slice(0, 240),
          serve: typeof p.serve === "string" ? p.serve : null,
          decantMinutes: typeof p.decant_minutes === "number" ? p.decant_minutes : null,
          caution: typeof p.caution === "string" && p.caution.trim() ? p.caution : null,
        };
      });

    const grapes = (Array.isArray(parsed?.grapes) ? parsed!.grapes : [])
      .slice(0, 3)
      .map((g: Record<string, unknown>) => ({
        grape: String(g?.grape ?? "").slice(0, 80),
        why: String(g?.why ?? "").slice(0, 200),
        region: typeof g?.region === "string" ? g.region.slice(0, 160) : null,
        // Same id check as the picks, so "you already own two of these" is never a lie.
        cellarIds: (Array.isArray(g?.cellar_ids) ? g.cellar_ids : []).filter(
          (id: unknown): id is string => typeof id === "string" && cellarById.has(id),
        ),
      }))
      .filter((g) => g.grape);

    const wishlistPicks = (Array.isArray(parsed?.wishlist_picks) ? parsed!.wishlist_picks : [])
      .filter((p: Record<string, unknown>) => typeof p?.id === "string" && wishlistById.has(p.id as string))
      .slice(0, 2)
      .map((p: Record<string, unknown>) => ({
        wine: wishlistById.get(p.id as string)!,
        why: String(p.why ?? "").slice(0, 240),
      }));

    // Two options exactly, both non-empty strings, or the entry is dropped: a
    // half-formed chip row is worse than none.
    const followUps = (Array.isArray(parsed?.follow_ups) ? parsed!.follow_ups : [])
      .filter(
        (f: Record<string, unknown>) =>
          typeof f?.question === "string" &&
          f.question.trim().length > 0 &&
          Array.isArray(f.options) &&
          f.options.length === 2 &&
          f.options.every((o: unknown) => typeof o === "string" && o.trim().length > 0),
      )
      .slice(0, 3)
      .map((f: Record<string, unknown>) => ({
        question: String(f.question).trim().slice(0, 160),
        options: (f.options as string[]).map((o) => o.trim().slice(0, 60)),
      }));

    return {
      profile,
      avoid:
        typeof parsed?.avoid === "string" && parsed.avoid.trim()
          ? parsed.avoid.trim().slice(0, 240)
          : null,
      grapes,
      picks,
      wishlistPicks,
      gap: typeof parsed?.gap === "string" && parsed.gap.trim() ? parsed.gap : null,
      followUps,
      cellarSize: candidates.length,
    };
  });

/* ------------------------------------------------------------------------ */
/* Call two: named bottles to buy. Grounded, slower, fired only when the user */
/* chose "anything". Takes the profile from call one so the two agree.        */
/* ------------------------------------------------------------------------ */

export const discoverBottles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dish: z.string().trim().min(3).max(400),
        profile: z.string().trim().min(3).max(500),
        grapes: z.array(z.string().max(80)).max(3).default([]),
        localMode: localSchema.default("off"),
        marketCountry: z.string().length(2).nullable().optional(),
        currency: z.string().min(1).max(4).default("USD"),
        priceMin: z.number().nonnegative().nullable().optional(),
        priceMax: z.number().positive().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const market = data.marketCountry?.toUpperCase() ?? null;
    const money = data.currency;
    const band =
      data.priceMin != null || data.priceMax != null
        ? `Budget: roughly ${data.priceMin ?? 0} to ${data.priceMax ?? "any"} ${money} per bottle. Stay inside it.`
        : `No strict budget, but keep it sensible for a home meal.`;

    const prompt = `Find real bottles a person can actually buy for one meal.

Dish: ${data.dish}
Wine profile that suits it: ${data.profile}
${data.grapes.length ? `Grapes or styles already identified: ${data.grapes.join(", ")}` : ""}
${band}
${localLine(data.localMode, market)}

Write every piece of prose you return in the same language the dish is written in. If the dish is in French, answer entirely in French. Wine terms, appellations and producer names keep their own spelling. This applies to every "why".

Use Google Search. Name at most 3 bottles, and only bottles you actually found evidence for, sold in ${market ?? "the user's market"}.

Rules:
- Producer and cuvee must exist. Never assemble a plausible sounding name from parts.
- Never invent a price. If search gives no price, set "price_estimate" to null.
- If search turns up nothing solid, return an empty "bottles" array. That is an acceptable and correct answer. Do not fall back on wines you remember.
- Cite the pages you actually used, at most 3 full URLs. Never invent a URL.

Return ONLY valid JSON, no markdown fences:
{"bottles":[{"name":"","producer":"","origin":"","price_estimate":"","why":"max 25 words"}],"sources":[]}`;

    const result = await callGateway({
      model: MODELS.GROUNDED,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "google_search" }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) return { bottles: [], sources: [] };
    const parsed = parseJsonBlock(text);

    const bottles = (Array.isArray(parsed?.bottles) ? parsed!.bottles : [])
      .slice(0, 3)
      .map((b: Record<string, unknown>) => ({
        name: String(b?.name ?? "").slice(0, 120),
        producer: typeof b?.producer === "string" ? b.producer.slice(0, 120) : null,
        origin: typeof b?.origin === "string" ? b.origin.slice(0, 120) : null,
        priceEstimate: typeof b?.price_estimate === "string" ? b.price_estimate.slice(0, 40) : null,
        why: String(b?.why ?? "").slice(0, 240),
      }))
      .filter((b) => b.name);

    // Grounding returns redirect URLs. Resolve them, dedupe by host, cap at 3.
    const raw = Array.isArray(parsed?.sources) ? parsed!.sources : [];
    const urls: string[] = [];
    for (const item of raw.slice(0, 6)) {
      if (typeof item !== "string") continue;
      try {
        const url = new URL(item.trim());
        if (url.protocol === "https:") urls.push(url.toString());
      } catch {
        // skip malformed URL
      }
    }
    const resolved = await Promise.all(
      urls.map(async (url) => {
        if (!isGroundingRedirect(url)) return url;
        try {
          // GET with redirect:"manual" so the Location header can be read
          // without following it. The body is never consumed.
          const res = await fetch(url, { method: "GET", redirect: "manual" });
          const location = res.headers.get("location");
          return location && location.startsWith("https://") ? location : url;
        } catch {
          return url;
        }
      }),
    );
    const hosts = new Set<string>();
    const sources: string[] = [];
    for (const url of resolved) {
      let host: string;
      try {
        host = new URL(url).host;
      } catch {
        continue;
      }
      if (hosts.has(host)) continue;
      hosts.add(host);
      sources.push(url);
      if (sources.length >= 3) break;
    }

    return { bottles, sources };
  });
