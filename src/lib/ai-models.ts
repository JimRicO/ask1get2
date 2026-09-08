/**
 * Every model id in the app lives here.
 *
 * Google is retiring the Gemini 2.5 series no earlier than 16 October 2026, and
 * some callers saw 2.5-flash start refusing requests before that date. The 2.0
 * line went the same way in June. Assume the next retirement lands mid-quarter
 * and that this file is where the migration happens, not the call sites.
 *
 * Both ids below are google/gemini-3.7-flash because that id is proven against
 * the Lovable gateway by describeWine in wine-ai.functions.ts. If 3.8-flash is
 * exposed on the gateway, bump FAST first, re-run the pairing eval set, then
 * bump GROUNDED. Do not bump both in one commit: grounded output is harder to
 * judge, and you want one variable moving at a time.
 */

export const MODELS = {
  /** Ranking and reasoning over data we supply. No web access. */
  FAST: "google/gemini-3.7-flash",
  /** Anything that names a real producer, price or retailer. Search grounded. */
  GROUNDED: "google/gemini-3.7-flash",
} as const;
