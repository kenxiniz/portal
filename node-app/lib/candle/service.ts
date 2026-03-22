/* lib/candle/service.ts */
import { CandleKR, CandleUS, ICandle } from "../models/candle";
import { getFromCache, setToCache, invalidateCache } from "./cache";

/**
 * Calculates the expiration date based on the timeframe.
 * To keep data for at least 2 years of daily records and prevent
 * minute data from disappearing too quickly, we'll set a generous TTL.
 */
function calculateExpireAt(): Date {
  const now = new Date();
  // 365 days = 365 * 24 * 60 * 60 * 1000 ms
  return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
}

/**
 * Retrieves candles from Cache or MongoDB.
 * Changed default limit to 600 to cover ~2 years of daily trading data (approx. 252 days/year).
 */
/* /lib/candle/service.ts */
export async function getCandles(
  market: "KR" | "US",
  ticker: string,
  timeframe: string,
  limit: number = 100, // 기본값은 유지하되 내부에서 조정
  forceRefresh: boolean = false,
): Promise<ICandle[]> {
  // [FIX] 일봉(1d)인 경우 2년치를 보장하기 위해 limit을 600으로 강제 상향
  const finalLimit = timeframe === "1d" ? Math.max(limit, 600) : limit;

  // 캐시 키에도 변경된 finalLimit 반영
  const cacheKey = `${market}_${ticker}_${timeframe}_${finalLimit}`;

  if (forceRefresh) {
    invalidateCache(cacheKey);
  } else {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) return cachedData as ICandle[];
  }

  const Model = market === "KR" ? CandleKR : CandleUS;

  // 1. 최신순(-1)으로 정렬하여 최신 데이터부터 finalLimit만큼 정확히 끊어옵니다.
  const results = await Model.find({
    "meta.ticker": ticker,
    "meta.timeframe": timeframe,
  })
    .sort({ timestamp: -1 })
    .limit(finalLimit)
    .lean();

  // 2. [CRITICAL] 가져온 데이터가 없으면 빈 배열 반환
  if (!results || results.length === 0) {
    return [];
  }

  // 3. 자바스크립트에서 시간순(오름차순)으로 재정렬
  // 이 결과가 stockUtils의 RSI 계산기로 들어가야 인덱스 0부터 순서대로 지표가 계산됩니다.
  const candles = (results as unknown as ICandle[]).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  setToCache(cacheKey, candles);
  return candles;
}

/**
 * Saves or updates a candle in MongoDB with a calculated TTL (expireAt).
 */
export async function saveCandle(
  market: "KR" | "US",
  ticker: string,
  timeframe: string,
  candleData: {
    timestamp: string | Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  },
): Promise<void> {
  const Model = market === "KR" ? CandleKR : CandleUS;

  // [FIX] 인자 없이 호출하도록 수정
  const expireAt = calculateExpireAt();

  await Model.findOneAndUpdate(
    {
      "meta.ticker": ticker,
      "meta.timeframe": timeframe,
      timestamp: new Date(candleData.timestamp),
    },
    {
      $set: {
        timestamp: new Date(candleData.timestamp),
        meta: { ticker, timeframe },
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: candleData.volume,
        expireAt: expireAt,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}
