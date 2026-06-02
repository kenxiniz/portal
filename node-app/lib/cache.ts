/* lib/cache.ts */

// Define the structure of cached data using a generic type T
export interface CacheEntry<T = unknown> {
  data: T;
  updatedAt: number;
}

// Use global object to prevent cache reset during Hot Module Replacement
// and ensure a single instance across the Node.js process.
const globalForCache = global as unknown as {
  sharedMemoryCache: Map<string, CacheEntry<unknown>>;
};

export const sharedMemoryCache =
  globalForCache.sharedMemoryCache || new Map<string, CacheEntry<unknown>>();

if (process.env.NODE_ENV !== "production") {
  globalForCache.sharedMemoryCache = sharedMemoryCache;
}

/**
 * Save data to the memory cache.
 * @param key The cache key (e.g., 'kisStock:ARM:D' or 'kStock:005930:H')
 * @param data The actual data array or object to cache
 */
export function setCacheData<T>(key: string, data: T): void {
  sharedMemoryCache.set(key, {
    data,
    updatedAt: Date.now(),
  });
  console.log(`[MemoryCache] Data successfully cached for key: ${key}`);
}

/**
 * Retrieve data from the memory cache.
 * @param key The cache key to look up
 * @returns The cached data, or null if not found
 */
export function getCacheData<T>(key: string): T | null {
  const entry = sharedMemoryCache.get(key);
  if (!entry) {
    return null;
  }
  // Safely cast the unknown data back to the requested type T
  return entry.data as T;
}

/**
 * Clear all data in the memory cache (optional utility).
 */
export function clearMemoryCache(): void {
  sharedMemoryCache.clear();
  console.log("[MemoryCache] All cached data has been cleared.");
}
