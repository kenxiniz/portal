/* /app/api/kStock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/mongodb";
import { getCandles, saveCandlesBulk } from "../../../../lib/candle/service";
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "../../../../lib/stockUtils";
import {
  getDailyKoreanStockData,
  getMinuteKoreanStockData,
} from "../../../../lib/koreanKisApi";
import { TickerAdvice } from "../../../../lib/models/advice";

// Force Next.js to completely disable caching for this API route
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[];
  advice: AdviceObject | null;
};

type CacheEntry = {
  fetchDate: string;
  timestamp: number;
  payload: CachePayload;
};

const globalCache = global as typeof globalThis & {
  kStockApiCache: Map<string, CacheEntry>;
};

const apiCache = globalCache.kStockApiCache || new Map<string, CacheEntry>();
if (process.env.NODE_ENV !== "production") {
  globalCache.kStockApiCache = apiCache;
}

const getTodayKST = () => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset).toISOString().split("T")[0];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const isForceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const cacheKey = `${ticker}-${timeframe}`;
  const todayStr = getTodayKST();

  try {
    await connectDB();

    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const latestAdvice = adviceDoc?.advice || null;

    // --- Step 1: Memory Cache ---
    if (apiCache.has(cacheKey) && !isForceRefresh) {
      const cachedData = apiCache.get(cacheKey)!;
      const isToday = cachedData.fetchDate === todayStr;
      const isFresh = Date.now() - cachedData.timestamp < 10 * 1000; // 10 seconds retention

      if (isToday && isFresh) {
        console.log(
          `[INFO] [${ticker}] KR Cache HIT (Memory) for ${timeframe}`,
        );
        cachedData.payload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedData.payload);
      }
    }

    if (isForceRefresh) {
      console.log(
        `[INFO] [${ticker}] Manual refresh requested. Bypassing Memory Cache.`,
      );
    }

    // --- Step 2: Fetch DB & Deduplicate Early ---
    const rawDbData = await getCandles("KR", ticker, timeframe, 1500, false);
    const dbMap = new Map();

    if (rawDbData && rawDbData.length > 0) {
      for (const c of rawDbData) {
        dbMap.set(new Date(c.timestamp).getTime(), c);
      }
    }

    const uniqueDbCandles = Array.from(dbMap.values()).sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let latestDbTimestamp = 0;
    if (uniqueDbCandles.length > 0) {
      latestDbTimestamp = new Date(
        uniqueDbCandles[uniqueDbCandles.length - 1].timestamp,
      ).getTime();
    }

    // --- Step 3: Self-Healing & Calculate API Fetch Boundary ---
    let stopTimestamp = 0;
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    // [핵심 수정] 각 timeframe별로 달성 가능한 '현실적 최대 캔들 수'를 목표치로 설정합니다.
    let targetCandles = 500;
    if (timeframe === "1h") {
      targetCandles = 120; // 한국 주식 1시간봉은 최대 약 130개까지만 생성 가능
    } else if (timeframe === "15m") {
      targetCandles = 400; // 한국 주식 15분봉은 최대 약 480개까지만 생성 가능
    }

    // 1. DB에 캔들이 목표치보다 부족하거나 (과거 데이터 누락)
    // 2. 가장 마지막 업데이트가 1주일이 넘었을 때 (데이터 방치) 풀스캔을 돌립니다.
    const isMissingMoreThanOneWeek =
      uniqueDbCandles.length < targetCandles ||
      now - latestDbTimestamp > oneWeekMs;

    if (isMissingMoreThanOneWeek) {
      if (timeframe === "1d") {
        stopTimestamp = now - 730 * 24 * 60 * 60 * 1000; // 2년 치
      } else if (timeframe === "1h") {
        stopTimestamp = now - 60 * 24 * 60 * 60 * 1000; // 60일 치
      } else {
        stopTimestamp = now - 15 * 24 * 60 * 60 * 1000; // 15일 치
      }
      console.log(
        `[WARN] [${ticker}] DB needs healing (Count: ${uniqueDbCandles.length} < Target: ${targetCandles} or Stale). Force fetching full history down to: ${new Date(stopTimestamp).toISOString()}`,
      );
    } else {
      stopTimestamp = latestDbTimestamp;
      console.log(
        `[INFO] [${ticker}] Fetching missing data since ${new Date(stopTimestamp).toISOString()}`,
      );
    }

    // --- Step 4: Fetch from API ---
    let apiData: StockDataPoint[] = [];

    if (timeframe === "1d") {
      apiData = await getDailyKoreanStockData(ticker, stopTimestamp);
    } else {
      const gap = timeframe === "1h" ? 60 : 15;
      apiData = await getMinuteKoreanStockData(ticker, gap, 60, stopTimestamp);
    }

    // --- Step 5: Strictly Filter & Save ---
    if (apiData && apiData.length > 0) {
      const newDataToSave = apiData.filter((candle) => {
        // If we did a deep fetch due to missing data, save everything we fetched
        if (isMissingMoreThanOneWeek) return true;

        // Otherwise, only save data newer than our latest DB record
        return new Date(candle.date).getTime() >= latestDbTimestamp;
      });

      if (newDataToSave.length > 0) {
        console.log(
          `[INFO] [${ticker}] Upserting ${newDataToSave.length} records to DB...`,
        );

        const formattedCandles = newDataToSave.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));

        await saveCandlesBulk("KR", ticker, timeframe, formattedCandles);
      }
    }

    // --- Step 6: Memory Merge (Bulletproof Chart Rendering) ---
    const finalMap = new Map();

    for (const c of uniqueDbCandles) {
      finalMap.set(new Date(c.timestamp).getTime(), c);
    }

    if (apiData && apiData.length > 0) {
      for (const c of apiData) {
        finalMap.set(new Date(c.date).getTime(), {
          timestamp: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        });
      }
    }

    const finalData = Array.from(finalMap.values());

    if (finalData.length > 0) {
      const sortedData = finalData
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .slice(-500);

      const mappedData = sortedData.map((c) => ({
        date:
          timeframe === "1d"
            ? new Date(c.timestamp).toISOString().split("T")[0]
            : new Date(c.timestamp)
                .toISOString()
                .replace("Z", "")
                .replace("T", " "),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const processedData = calculateBollingerBands(calculateRSI(mappedData));
      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
      );

      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null,
      };

      apiCache.set(cacheKey, {
        fetchDate: todayStr,
        timestamp: Date.now(),
        payload: responsePayload,
      });

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[ERROR] [KR API Route - ${ticker}]`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
