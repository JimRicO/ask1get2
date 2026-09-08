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

const MAX_LIST_ENTRIES = 200;
const LIST_COLOURS = ["red", "white", "rose", "sparkling", "sweet", "fortified", "unknown"] as const;
type ListColour = (typeof LIST_COLOURS)[number];

export type WineListEntry = {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  colour: ListColour;
  price: string | null;
  byTheGlass: boolean;
};

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

1. "profile": what this dish asks of a wine, described only through what the food does and with no bottle named. Give {"headline": at most 8 words, e.g. "Rich lactic fat, gentle salt, soft texture", "detail": one or two sentences explaining which parts of the dish drive that, naming fat, acid, sweetness, heat, smoke or texture}. Speak in terms of fat to cut, salt to balance, sweetness to match, heat to soften, texture to carry, aromas to echo.
   Do NOT name a wine type, colour, grape or category in "profile". No "effervescent", no "blanc", no "rouge léger", no appellation. Describe only what the dish asks a wine to do. Which wines answer that comes later, and naming one here forecloses the rest of the answer.
   Always fill this in, even when the cellar has nothing suitable. This is the part the user learns from.

2. "avoid": one sentence naming what actively ruins this dish and why. Name the mechanism, not the category. If a lighter or different expression of the same category does work, say so in the same sentence. "Tannin hardens against lactic fat, so avoid tannic reds, though a light low-tannin red is a different matter" is right. "Avoid reds" is wrong and closes off a legitimate pairing. Return null only if nothing is genuinely worth warning about.

3. "grapes": 1 to 3 grape varieties or styles that answer that profile. Each: {"grape", "why" (max 20 words), "region" (one or two regions known for it), "cellar_ids": ids from the CELLAR list above that are made from this grape or style, empty array if none}. Only use exact id strings from the list. This layer is about the kind of wine, not a specific bottle.
   Where the dish admits more than one legitimate approach, cover at least two DISTINCT ones, and say what each trades off rather than ranking them. Bubbles that cut through fat and a light low-tannin red that carries alongside it are two different answers to the same cheese, and a sommelier offers both with the reason to choose each. Only return three variations on one idea when the dish genuinely admits only one approach, which is rarer than it looks.
   Each "why" must say what that approach does that the others do not.

4. "picks": up to 3 bottles from CELLAR, ranked best first, identified ONLY by their exact "id" string. Never invent a bottle. Fewer than 3 is better than a weak third.
   Each: {"id", "rank", "why" (max 25 words, name the actual mechanism: acid, tannin, weight, sweetness, fat, smoke, spice), "serve" (Celsius range), "decant_minutes" (integer, 0 if none), "caution" (one short sentence or null)}.
   Use "caution" when the bottle looks too young to drink well (the current year is ${currentYear}, judge from vintage, type and origin) or when its price makes it extravagant for this dish.

5. "reference": the classic pairing for this dish, whether or not the user owns anything like it, as {"heading": at most 3 words naming this section, "pairing": the canonical style or appellation, "why": one sentence on why it is the reference, "versus_yours": one sentence comparing it honestly to the top pick, or null if there are no picks}. Be candid in "versus_yours": if the user's bottle is a genuine equal, say so; if it is close but misses something the reference has, name what it misses. Do not flatter. Return null only if the dish has no established reference pairing.

${includeWishlist ? `6. "wishlist_picks": up to 2 entries from WISHLIST that suit this dish, as {"id", "why"}. They do not own these. Empty array if none fit.` : `6. "wishlist_picks": []`}

7. "gap": if the cellar genuinely does not serve this dish, one or two sentences on what is missing, in ${money}. Otherwise null.

8. "follow_ups": 2 or 3 short questions a sommelier would actually ask about THIS dish to sharpen the recommendation, each with 2 options. Derive them from the dish, never generic. For a blue cheese: how strong is it, young or piquant. For a curry: how hot. For a roast: what sauce. Shape: [{"question": "...", "options": ["...", "..."]}]. Each option must be a short phrase that reads naturally when appended to the dish description. Return an empty array only if the dish is already fully specified.
   Also return "follow_ups_intro": a heading of at most 3 words and a single short sentence telling the user that tapping an option refines the recommendation. Shape: {"heading": "...", "hint": "..."}. Same language as the rest.

9. "discover_label": a short call to action, at most 6 words, meaning roughly "see other bottles worth buying". Same language as the rest.

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

    const introRaw = (parsed?.follow_ups_intro ?? null) as Record<string, unknown> | null;
    const followUpsIntro =
      introRaw && (typeof introRaw.heading === "string" || typeof introRaw.hint === "string")
        ? {
            heading:
              typeof introRaw.heading === "string" && introRaw.heading.trim()
                ? introRaw.heading.trim().slice(0, 60)
                : null,
            hint:
              typeof introRaw.hint === "string" && introRaw.hint.trim()
                ? introRaw.hint.trim().slice(0, 200)
                : null,
          }
        : null;

    // "pairing" is the one field the block cannot render without, so it gates
    // the whole thing. The rest degrade to null independently.
    const referenceRaw = (parsed?.reference ?? null) as Record<string, unknown> | null;
    const reference =
      referenceRaw && typeof referenceRaw.pairing === "string" && referenceRaw.pairing.trim()
        ? {
            heading:
              typeof referenceRaw.heading === "string" && referenceRaw.heading.trim()
                ? referenceRaw.heading.trim().slice(0, 60)
                : null,
            pairing: referenceRaw.pairing.trim().slice(0, 160),
            why:
              typeof referenceRaw.why === "string" && referenceRaw.why.trim()
                ? referenceRaw.why.trim().slice(0, 300)
                : null,
            versusYours:
              typeof referenceRaw.versus_yours === "string" && referenceRaw.versus_yours.trim()
                ? referenceRaw.versus_yours.trim().slice(0, 300)
                : null,
          }
        : null;

    return {
      profile,
      avoid:
        typeof parsed?.avoid === "string" && parsed.avoid.trim()
          ? parsed.avoid.trim().slice(0, 240)
          : null,
      grapes,
      picks,
      reference,
      wishlistPicks,
      gap: typeof parsed?.gap === "string" && parsed.gap.trim() ? parsed.gap : null,
      followUps,
      followUpsIntro,
      // English fallback: the row still has to be tappable when the model
      // omits the label.
      discoverLabel:
        typeof parsed?.discover_label === "string" && parsed.discover_label.trim()
          ? parsed.discover_label.trim().slice(0, 60)
          : "See other bottles worth buying",
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
- Do not return three variations on one idea. Where the profile and grapes admit more than one approach, spread the bottles across them so the user sees real alternatives rather than the same recommendation at three price points.

Also return, in the same language as the dish:
- "save_label": a short call to action for adding a bottle to the user's wishlist, e.g. "Ajouter à ma liste".
- "saved_label": the same button once the bottle is already on the list, e.g. "Déjà dans ma liste".
- "save_note": a short line meaning "Saved for <the dish>", built from the dish text, e.g. "Ajouté pour un lapin aux pruneaux". One line, no punctuation at the end.

Return ONLY valid JSON, no markdown fences:
{"bottles":[{"name":"","producer":"","origin":"","price_estimate":"","why":"max 25 words"}],"sources":[],"save_label":"","saved_label":"","save_note":""}`;

    const result = await callGateway({
      model: MODELS.GROUNDED,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "google_search" }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    // English defaults throughout: the button has to be usable even when the
    // model omits the labels entirely.
    const SAVE_LABEL = "Add to my list";
    const SAVED_LABEL = "Already on your list";
    if (!text) {
      return {
        bottles: [],
        sources: [],
        saveLabel: SAVE_LABEL,
        savedLabel: SAVED_LABEL,
        saveNote: `Saved for ${data.dish}`,
      };
    }
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

    return {
      bottles,
      sources,
      saveLabel:
        typeof parsed?.save_label === "string" && parsed.save_label.trim()
          ? parsed.save_label.trim().slice(0, 40)
          : SAVE_LABEL,
      savedLabel:
        typeof parsed?.saved_label === "string" && parsed.saved_label.trim()
          ? parsed.saved_label.trim().slice(0, 40)
          : SAVED_LABEL,
      saveNote:
        typeof parsed?.save_note === "string" && parsed.save_note.trim()
          ? parsed.save_note.trim().slice(0, 160)
          : `Saved for ${data.dish}`,
    };
  });

/* ------------------------------------------------------------------------ */
/* Restaurant mode, pass one: read a photographed wine list into rows. The    */
/* cellar plays no part in this feature and is never queried here.            */
/* ------------------------------------------------------------------------ */

export const extractWineList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        // Restaurant lists run to several pages, so multiple photos are the
        // normal case rather than the exception.
        images: z.array(z.string().min(1)).min(1).max(6),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const prompt = `You are reading a restaurant wine list from photographs.

Transcribe only what is printed. Never complete a partial name from your own knowledge, never infer a producer that is not shown, never guess a vintage. A wine you can only half read is transcribed as far as it is legible, with the rest null.

Return every wine you can read, in the order printed, including house wines and by-the-glass sections. Several photographs are pages of the same list: read them all and return one continuous list.

If a page is too blurred, dark or cropped to read, set "unreadable" to true and still return whatever entries you did manage. Do not silently return a short list as if it were complete.

Extract the restaurant name if it appears anywhere on the page, otherwise null.

Answer in the language of the list.

Return ONLY valid JSON, no markdown fences:
{"restaurant_name": null, "unreadable": false, "entries": [{"name": "as printed", "producer": null, "vintage": null, "region": "as printed or null", "colour": "red|white|rose|sparkling|sweet|fortified|unknown", "price": "the price exactly as printed, as a string, e.g. \\"48\\" or \\"48 €\\" or \\"€48 / 9.5 glass\\". Never convert it to a number.", "by_the_glass": false}]}`;

    const content: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: prompt }];

    for (const image of data.images) {
      const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64}` },
      });
    }

    const result = await callGateway({
      // MODELS.VISION was removed as dead code before this feature existed.
      model: MODELS.FAST,
      messages: [{ role: "user", content }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Could not read that wine list");
    const parsed = parseJsonBlock(text);

    // Ids are assigned here, after parsing, so the model cannot invent one and
    // pass two cannot be handed a reference to a wine that was never on the list.
    const entries: WineListEntry[] = (Array.isArray(parsed?.entries) ? parsed!.entries : [])
      .filter((e: Record<string, unknown>) => typeof e?.name === "string" && e.name.trim())
      .slice(0, MAX_LIST_ENTRIES)
      .map((e: Record<string, unknown>, i: number) => {
        // Vintages come back as 2019 or "2019" depending on the page.
        const rawVintage =
          typeof e.vintage === "number"
            ? e.vintage
            : typeof e.vintage === "string"
              ? Number.parseInt(e.vintage, 10)
              : NaN;
        return {
          id: `w${i}`,
          name: String(e.name).trim().slice(0, 160),
          producer:
            typeof e.producer === "string" && e.producer.trim()
              ? e.producer.trim().slice(0, 120)
              : null,
          vintage: Number.isFinite(rawVintage) ? Math.trunc(rawVintage) : null,
          region:
            typeof e.region === "string" && e.region.trim() ? e.region.trim().slice(0, 120) : null,
          colour: (typeof e.colour === "string" &&
          (LIST_COLOURS as readonly string[]).includes(e.colour)
            ? e.colour
            : "unknown") as ListColour,
          price: typeof e.price === "string" && e.price.trim() ? e.price.trim().slice(0, 60) : null,
          byTheGlass: e.by_the_glass === true,
        };
      });

    return {
      entries,
      restaurantName:
        typeof parsed?.restaurant_name === "string" && parsed.restaurant_name.trim()
          ? parsed.restaurant_name.trim().slice(0, 120)
          : null,
      // A short list that claims to be complete is the failure mode that makes
      // the whole feature untrustworthy, so this is surfaced, not swallowed.
      unreadable: parsed?.unreadable === true,
    };
  });

/* ------------------------------------------------------------------------ */
/* Restaurant mode, pass two: pick for the table from the list that was read. */
/* No cellar access: this feature has nothing to do with what the user owns.  */
/* ------------------------------------------------------------------------ */

const listEntrySchema = z.object({
  id: z.string().min(1).max(16),
  name: z.string().min(1).max(200),
  producer: z.string().max(200).nullable(),
  vintage: z.number().nullable(),
  region: z.string().max(200).nullable(),
  // The same union extractWineList normalises to, so an entry survives the
  // round trip from extraction into the pairing call with its type intact.
  colour: z.enum(LIST_COLOURS),
  price: z.string().max(80).nullable(),
  byTheGlass: z.boolean(),
});

export const pairFromList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entries: z.array(listEntrySchema).min(1).max(MAX_LIST_ENTRIES),
        dishes: z.string().trim().min(3).max(600),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const byId = new Map(data.entries.map((e) => [e.id, e]));

    const listRows = data.entries.map((e) => ({
      id: e.id,
      name: e.name,
      producer: e.producer,
      vintage: e.vintage,
      region: e.region,
      colour: e.colour,
      price: e.price,
      by_the_glass: e.byTheGlass,
    }));

    const monthYear = new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const prompt = `You are the sommelier at this restaurant, advising one table.

The table is eating: ${data.dishes}

THE WINE LIST (everything available, nothing else exists):
${JSON.stringify(listRows)}

Choose ONLY from the entries above, identified ONLY by their exact "id" string. Never name a wine that is not on this list.

With several dishes the job is not the best match for any one plate but the wine that serves the whole table with the least compromise. High acidity, moderate body and soft tannin usually flatter the widest range. Name the compromise honestly rather than claiming a perfect fit for everything.

Prefer entries with "by_the_glass": true when the dishes are irreconcilable and a split would need more than two bottles.

Answer entirely in the language of the dishes.

Return ONLY valid JSON, no markdown fences:
{
  "table_read": "one sentence on what these dishes have in common and where they conflict",
  "single": {"id": "", "why": "why this bottle serves the table best", "compromise": "which dish it serves least well and why, or null when it genuinely suits everything"},
  "split": {"bottles": [{"id": "", "serves": "which dishes this one is for", "why": ""}], "rationale": "one sentence on why two bottles beat one here"},
  "verdict": "one honest sentence about this list for this food. If the list is genuinely poor for what the table ordered, say so.",
  "save_label": "short button label meaning \\"we liked it\\", e.g. \\"on a aimé\\"",
  "saved_label": "the same button once saved, e.g. \\"déjà dans ma liste\\"",
  "save_note_with_place": "a line recording the occasion, meaning \\"Drunk with <the dishes>, at {restaurant}, ${monthYear}\\". Keep the literal token {restaurant} exactly as written. Render the month and year in the language of the dishes.",
  "save_note_plain": "the same line without the restaurant, meaning \\"Drunk with <the dishes>, ${monthYear}\\""
}

"split" must be null when one bottle genuinely does the job. When present it must contain exactly 2 bottles.`;

    const result = await callGateway({
      model: MODELS.FAST,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("No recommendation returned by AI");
    const parsed = parseJsonBlock(text);

    // Every id is checked against the list we sent, exactly as the cellar picks
    // are. A wine that was never on the list is dropped rather than shown to
    // someone sitting in the restaurant holding the real thing.
    const singleRaw = (parsed?.single ?? null) as Record<string, unknown> | null;
    const singleEntry =
      singleRaw && typeof singleRaw.id === "string" ? byId.get(singleRaw.id) : undefined;
    const single = singleEntry
      ? {
          entry: singleEntry,
          why: String(singleRaw?.why ?? "").slice(0, 300),
          compromise:
            typeof singleRaw?.compromise === "string" && singleRaw.compromise.trim()
              ? singleRaw.compromise.trim().slice(0, 300)
              : null,
        }
      : null;

    const splitRaw = (parsed?.split ?? null) as Record<string, unknown> | null;
    const splitBottles = (Array.isArray(splitRaw?.bottles) ? splitRaw!.bottles : [])
      .filter((b: Record<string, unknown>) => typeof b?.id === "string" && byId.has(b.id as string))
      .slice(0, 2)
      .map((b: Record<string, unknown>) => ({
        entry: byId.get(b.id as string)!,
        serves: String(b.serves ?? "").slice(0, 200),
        why: String(b.why ?? "").slice(0, 300),
      }));
    // One bottle is not a split, it is the single pick again.
    const split =
      splitBottles.length === 2
        ? {
            bottles: splitBottles,
            rationale:
              typeof splitRaw?.rationale === "string" && splitRaw.rationale.trim()
                ? splitRaw.rationale.trim().slice(0, 300)
                : null,
          }
        : null;

    return {
      tableRead:
        typeof parsed?.table_read === "string" && parsed.table_read.trim()
          ? parsed.table_read.trim().slice(0, 400)
          : null,
      single,
      split,
      verdict:
        typeof parsed?.verdict === "string" && parsed.verdict.trim()
          ? parsed.verdict.trim().slice(0, 400)
          : null,
      saveLabel:
        typeof parsed?.save_label === "string" && parsed.save_label.trim()
          ? parsed.save_label.trim().slice(0, 40)
          : "We liked it",
      savedLabel:
        typeof parsed?.saved_label === "string" && parsed.saved_label.trim()
          ? parsed.saved_label.trim().slice(0, 40)
          : "Already on your list",
      // Two complete sentences rather than one with a stitched-in connector:
      // "chez" and its equivalents do not compose the same way across languages.
      saveNoteWithPlace:
        typeof parsed?.save_note_with_place === "string" && parsed.save_note_with_place.trim()
          ? parsed.save_note_with_place.trim().slice(0, 240)
          : `Drunk with ${data.dishes}, at {restaurant}, ${monthYear}`,
      saveNotePlain:
        typeof parsed?.save_note_plain === "string" && parsed.save_note_plain.trim()
          ? parsed.save_note_plain.trim().slice(0, 240)
          : `Drunk with ${data.dishes}, ${monthYear}`,
    };
  });

/* ------------------------------------------------------------------------ */
/* Restaurant mode, pass three: read the food menu so the table can tap what  */
/* it ordered. pairFromList is untouched: the selection composes into the     */
/* same free-text dishes string it already takes.                             */
/* ------------------------------------------------------------------------ */

const MAX_MENU_DISHES = 120;

export type MenuDish = {
  id: string;
  name: string;
  section: string | null;
};

export const extractMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        images: z.array(z.string().min(1)).min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const prompt = `You are reading a restaurant food menu from photographs.

Transcribe only what is printed. Never invent a dish, and never expand an ingredient list from your own knowledge of the recipe.

Keep the full descriptive line together with the dish name. Menus write "Pork schnitzel, maxibel beans, cucumber and buttermilk", and every one of those words decides the pairing. Do not shorten that to "Pork schnitzel".

Include every section, in printed order, under the heading the menu itself uses.

Ignore prices entirely. They are not needed here.

If a page is too blurred or cropped to read, set "unreadable" to true and still return whatever you did read.

Extract the restaurant name if it appears anywhere, otherwise null.

Answer in the language of the menu.

Return ONLY valid JSON, no markdown fences:
{"restaurant_name": null, "unreadable": false, "selection_prompt": "a short question asking which dishes the table ordered, e.g. \\"Quels plats avez-vous commandés ?\\"", "dishes": [{"name": "the dish with its full printed ingredient line", "section": "the heading it sits under as printed, or null"}]}`;

    const content: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: prompt }];

    for (const image of data.images) {
      const base64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64}` },
      });
    }

    const result = await callGateway({
      model: MODELS.FAST,
      messages: [{ role: "user", content }],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Could not read that menu");
    const parsed = parseJsonBlock(text);

    // Ids assigned here, after parsing, for the same reason as the wine list:
    // the model never gets to mint a reference to something it invented.
    const dishes: MenuDish[] = (Array.isArray(parsed?.dishes) ? parsed!.dishes : [])
      .filter((d: Record<string, unknown>) => typeof d?.name === "string" && d.name.trim())
      .slice(0, MAX_MENU_DISHES)
      .map((d: Record<string, unknown>, i: number) => ({
        id: `d${i}`,
        // Generous cap: the ingredient line is the part that matters and it can
        // run long.
        name: String(d.name).trim().slice(0, 300),
        section:
          typeof d.section === "string" && d.section.trim() ? d.section.trim().slice(0, 80) : null,
      }));

    return {
      dishes,
      restaurantName:
        typeof parsed?.restaurant_name === "string" && parsed.restaurant_name.trim()
          ? parsed.restaurant_name.trim().slice(0, 120)
          : null,
      // The screen has to ask a question, not present a list. English fallback
      // so the step is never unlabelled.
      selectionPrompt:
        typeof parsed?.selection_prompt === "string" && parsed.selection_prompt.trim()
          ? parsed.selection_prompt.trim().slice(0, 120)
          : "Which dishes did the table order?",
      unreadable: parsed?.unreadable === true,
    };
  });
