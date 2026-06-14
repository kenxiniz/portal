/* lib/cache.ts */
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const TTL_SECONDS = 10 * 60;

const globalForRedis = globalThis as unknown as {
  redisClient: ReturnType<typeof createClient>;
};

export const redisClient =
  globalForRedis.redisClient || createClient({ url: REDIS_URL });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redisClient;
}

// 💡 [수정됨] 빌드 환경(IS_BUILD)이 아닐 때만 런타임 연결을 시도합니다.
if (process.env.IS_BUILD !== "true") {
  // 에러 이벤트 리스너를 달아두면 연결이 끊겨도 서버가 죽지 않고 자동 재연결을 시도합니다.
  redisClient.on("error", (err) => console.error("[Redis] Client Error:", err));

  if (!redisClient.isOpen) {
    redisClient
      .connect()
      .catch((err) => console.error("[Redis] Initial Connection Error:", err));
  }
}

export const setCacheData = async <T>(key: string, data: T): Promise<void> => {
  // 빌드 중이거나 연결되지 않았으면 무시 (에러 방지)
  if (!redisClient.isOpen) return;

  try {
    await redisClient.set(key, JSON.stringify(data), {
      EX: TTL_SECONDS,
    });
  } catch (error) {
    console.error(`[Redis] Failed to set cache for ${key}:`, error);
  }
};

export const getCacheData = async <T>(key: string): Promise<T | undefined> => {
  // 연결되지 않았으면 캐시 MISS로 간주 (DB로 우회)
  if (!redisClient.isOpen) return undefined;

  try {
    const cachedData = await redisClient.get(key);
    if (!cachedData) return undefined;

    return JSON.parse(cachedData) as T;
  } catch (error) {
    console.error(`[Redis] Failed to get cache for ${key}:`, error);
    return undefined;
  }
};

export const clearCacheData = async (): Promise<void> => {
  if (!redisClient.isOpen) return;

  try {
    await redisClient.flushDb();
  } catch (error) {
    console.error(`[Redis] Failed to clear cache:`, error);
  }
};
