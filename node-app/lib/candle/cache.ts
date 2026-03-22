/* lib/candle/cache.ts */
interface CacheEntry {
  data: unknown;
  savedAt: number;
}

const cacheStore = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getFromCache(key: string): unknown {
  const entry = cacheStore.get(key);
  if (entry && Date.now() - entry.savedAt < CACHE_TTL_MS) {
    console.log("✅ [Cache] HIT for key: " + key);
    return entry.data;
  }
  console.log("❌ [Cache] MISS for key: " + key);
  return null;
}

export function setToCache(key: string, data: unknown): void {
  console.log("[Cache] SET for key: " + key);
  cacheStore.set(key, {
    data,
    savedAt: Date.now(),
  });
}

export function invalidateCache(key: string): void {
  if (cacheStore.has(key)) {
    cacheStore.delete(key);
    console.log("[Cache] INVALIDATED for key: " + key);
  }
}
