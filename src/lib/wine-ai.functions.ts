import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type GatewayMessageContent = Array<
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
>;

async function callGateway(body: Record<string, unknown>) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("AI Gateway error:", response.status, detail);
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (response.status === 402) {
      throw new Error("AI credits required. Please add credits to continue.");
    }
    throw new Error(`AI processing failed: ${response.status}`);
  }

  return (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };
}

type JsonValue = string | number | boolean | null;

function parseJsonFromText(text: string): Record<string, JsonValue> | null {
  const fenced = text.match(/```json\n?([\s\S]*?)\n?```/);
  const braced = text.match(/\{[\s\S]*\}/);
  const candidate = fenced?.[1] ?? braced?.[0] ?? text;
  try {
    return JSON.parse(candidate.trim()) as Record<string, JsonValue>;
  } catch {
    return null;
  }
}

function normalizeWineType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.toLowerCase();
  if (t.includes("sparkling")) return "sparkling";
  if (t.includes("dessert") || t.includes("sweet")) return "dessert";
  if (t.includes("fortified") || t.includes("port") || t.includes("sherry")) {
    return "fortified";
  }
  if (t.includes("rosé") || t.includes("rose")) return "rose";
  if (t.includes("white")) return "white";
  if (t.includes("red")) return "red";
  return null;
}

const REMOVE_BACKGROUND_PROMPT =
  "Remove the background from this wine bottle or wine label image and replace it with a clean, professional monochrome cream background. CRITICAL: Keep the wine bottle/label EXACTLY as it is - do not modify, alter, or regenerate any text on the label. All text, logos, graphics, and label details must remain completely intact and unchanged. Only remove the background around the bottle/label.";

/** Extract full wine data from one or more bottle images. */
export const extractWineData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        images: z
          .array(z.object({ type: z.string(), data: z.string() }))
          .min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const imageDescriptions = data.images
      .map((img) => `${img.type} view`)
      .join(", ");

    const extractionPrompt = `Analyze these wine bottle images (${imageDescriptions}) carefully and extract ALL visible information:

CRITICAL - ALWAYS extract these if visible on the label:
- Wine name (REQUIRED)
- Producer/Winery name
- Vintage year
- Wine type: MUST be EXACTLY one of these lowercase values: "red", "white", "rose", "sparkling", "dessert", "fortified"
- Country of origin
- Region/Appellation
- **Alcohol content (ABV %) - Look carefully on the label, usually shown as "% ABV", "% vol", or "% alc/vol"**
- **Grape varietals - Extract ALL grape varieties mentioned on the label. This is CRITICAL information that should always be extracted if present.**
- A detailed description (2-3 sentences) based on visible information about the wine's style, characteristics, and origin

IMPORTANT INSTRUCTIONS:
1. Examine ALL images thoroughly to find the alcohol content percentage - it's usually on the front or back label
2. Look for grape varietals on the front label, back label, or neck label
3. Combine information from all images to provide the most complete data possible
4. Pay special attention to small text that might contain ABV or grape information
5. **CRITICAL**: wine_type MUST be lowercase and ONLY one of: "red", "white", "rose", "sparkling", "dessert", "fortified"

Return ONLY valid JSON with these exact keys: wine_name, producer, vintage_year, wine_type, country, region, alcohol_content, grape_varietals, description.
- For grape_varietals: return as a string with varieties separated by commas
- For alcohol_content: return as a number (e.g., 13.5)
- For wine_type: MUST be lowercase
- If any information is truly not visible or unclear after careful examination, use null for that field.`;

    const content: GatewayMessageContent = [
      { type: "text", text: extractionPrompt },
    ];

    for (const img of data.images) {
      const base64 = img.data.includes(",")
        ? img.data.slice(img.data.indexOf(",") + 1)
        : img.data;
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64}` },
      });
    }

    const result = await callGateway({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content }],
    });

    const text = result.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response from AI");

    const parsed = parseJsonFromText(text);
    const extracted: Record<string, JsonValue> = parsed
      ? { ...parsed, wine_type: normalizeWineType(parsed["wine_type"]) }
      : {
          wine_name: "Unknown Wine",
          producer: null,
          vintage_year: null,
          wine_type: null,
          country: null,
          region: null,
          alcohol_content: null,
          grape_varietals: null,
          description: null,
        };

    return { extracted };
  });

/** Read a wine label image and return the basic identifying fields. */
export const extractWineName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ image: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const result = await callGateway({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract wine information from this label image. Return a JSON object with these exact fields (use null for any field you can't determine):
{
  "wine_name": "the wine name",
  "producer": "the producer/winery name",
  "vintage_year": year as integer or null,
  "wine_type": "red/white/rose/sparkling/dessert/fortified or null",
  "region": "the wine region",
  "country": "the country",
  "grape_varietals": "comma-separated grape varieties or null"
}

Return ONLY valid JSON, no other text.`,
            },
            { type: "image_url", image_url: { url: data.image } },
          ] satisfies GatewayMessageContent,
        },
      ],
    });

    const text = result.choices?.[0]?.message?.content?.trim();
    const fallback = {
      wine_name: "Unknown Wine",
      producer: null,
      vintage_year: null,
      wine_type: null,
      region: null,
      country: null,
      grape_varietals: null,
    };

    if (!text) return { wineData: fallback };

    const parsed = parseJsonFromText(text);
    return { wineData: parsed ?? { ...fallback, wine_name: text } };
  });

/** Research a wine on the web and write a grounded description. */
export const describeWine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        wine_name: z.string().min(1),
        producer: z.string().nullable().optional(),
        vintage_year: z.union([z.number(), z.string()]).nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        grape_varietals: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const facts = [
      `Wine name: ${data.wine_name}`,
      data.producer ? `Producer: ${data.producer}` : null,
      data.vintage_year ? `Vintage: ${data.vintage_year}` : null,
      data.region ? `Region: ${data.region}` : null,
      data.country ? `Country: ${data.country}` : null,
      data.grape_varietals ? `Grapes: ${data.grape_varietals}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Search the web for this specific wine and write a factual description of it.

${facts}

Rules:
- Use Google Search to find real information about this producer, cuvée and vintage.
- Write 2 to 3 sentences covering style, grapes, terroir/appellation and typical character.
- Only state what you actually found or what is given above. Do NOT invent tasting notes, scores, awards or prices.
- If the web search finds nothing specific about this wine, write a short factual description based only on the facts given above, and say nothing you cannot support.
- Return the description text only: no preamble, no bullet points, no markdown, no citations.`;

    const result = await callGateway({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "google_search" }],
    });

    const description = result.choices?.[0]?.message?.content?.trim();
    if (!description) throw new Error("No description returned by AI");

    return { description };
  });

/** Remove the background of a single wine image and return the processed PNG data URL. */
export const removeWineBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ imageUrl: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const result = await callGateway({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: REMOVE_BACKGROUND_PROMPT },
            { type: "image_url", image_url: { url: data.imageUrl } },
          ] satisfies GatewayMessageContent,
        },
      ],
      modalities: ["image", "text"],
    });

    const processedImage = result.choices?.[0]?.message?.images?.[0]?.image_url
      ?.url;
    if (!processedImage) throw new Error("No processed image returned by AI");

    return { processedImage };
  });

