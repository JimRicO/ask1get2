import type { Database } from "@/integrations/supabase/types";

export type CachedWine = Database["public"]["Tables"]["wines"]["Row"];
export type CellarSnapshot = { wines: CachedWine[]; savedAt: number };
const DB_NAME = "wv-private-cellar";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("cellars");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readCellarSnapshot(userId: string): Promise<CellarSnapshot | null> {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("cellars", "readonly");
      const request = tx.objectStore("cellars").get(userId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch { return null; } // Private mode / storage full must not break online use.
}

export async function saveCellarSnapshot(userId: string, wines: CachedWine[]) {
  await updateSnapshot(userId, () => ({ wines, savedAt: Date.now() }));
}

export async function cacheWine(userId: string, wine: CachedWine) {
  await updateSnapshot(userId, (old) => ({
    wines: [...(old?.wines ?? []).filter((w) => w.id !== wine.id), wine],
    savedAt: Date.now(),
  }));
}

async function updateSnapshot(userId: string, update: (old: CellarSnapshot | undefined) => CellarSnapshot) {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("cellars", "readwrite");
      const store = tx.objectStore("cellars");
      const request = store.get(userId);
      request.onsuccess = () => store.put(update(request.result), userId);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch { /* Offline storage is best effort; saves to Cloud remain authoritative. */ }
}

export async function clearOfflineCellars() {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("cellars", "readwrite");
      tx.objectStore("cellars").clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch { /* No cache to clear when storage is unavailable. */ }
}