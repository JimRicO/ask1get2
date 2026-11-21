import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("sign-out clears the offline shell and any cached media", async () => {
  const listeners = new Map();
  const deleted = [];
  runInNewContext(readFileSync(new URL("../../public/cellar-sw.js", import.meta.url), "utf8"), {
    self: { addEventListener: (name, handler) => listeners.set(name, handler) },
    caches: { delete: async (name) => { deleted.push(name); return true; } },
  });
  let completion;
  listeners.get("message")({ data: { type: "CLEAR_PRIVATE_MEDIA" }, waitUntil: (pending) => { completion = pending; } });
  await completion;
  expect(deleted).toEqual(["wv-cellar-shell-v1"]);
});