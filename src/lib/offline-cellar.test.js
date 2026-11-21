import "fake-indexeddb/auto";
import { expect, test } from "bun:test";
import { saveCellarSnapshot, readCellarSnapshot, cacheWine, clearOfflineCellars } from "./offline-cellar";

test("offline inventory stays scoped to the signed-in account and clears on sign-out", async () => {
  await clearOfflineCellars();
  await saveCellarSnapshot("account-a", [{ id: "bottle-a", wine_name: "Test wine", current_stock: 2 }]);
  expect((await readCellarSnapshot("account-a"))?.wines[0]?.current_stock).toBe(2);
  expect(await readCellarSnapshot("account-b")).toBeNull();
  await cacheWine("account-a", { id: "bottle-a", wine_name: "Test wine", current_stock: 1 });
  expect((await readCellarSnapshot("account-a"))?.wines).toHaveLength(1);
  expect((await readCellarSnapshot("account-a"))?.wines[0]?.current_stock).toBe(1);
  await clearOfflineCellars();
  expect(await readCellarSnapshot("account-a")).toBeNull();
});