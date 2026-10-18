import { describe, expect, test } from "bun:test";
import { shouldResearch } from "./sommelier-expertise";
import { DEFAULT_PREFS } from "./sommelier-prefs";

describe("Profile research preferences", () => {
  test("Jamais blocks research even with consent", () => {
    expect(shouldResearch({ ...DEFAULT_PREFS, research: "off" }, true)).toBe(false);
  });
  test("Me demander d'abord requires consent", () => {
    const prefs = { ...DEFAULT_PREFS, research: "ask" as const };
    expect(shouldResearch(prefs)).toBe(false);
    expect(shouldResearch(prefs, true)).toBe(true);
  });
  test("Toujours chercher enables research without additional consent", () => {
    expect(shouldResearch({ ...DEFAULT_PREFS, research: "auto" })).toBe(true);
  });
});