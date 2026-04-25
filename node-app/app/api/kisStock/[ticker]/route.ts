/* /app/api/kisStock/[ticker]/route.ts */

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
import { getDailyStockData, getMinuteStockData } from "../../../../lib/kisApi";
import { TickerAdvice } from "../../../../lib/models/advice";

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
  stockApiCache: Map<string, CacheEntry>;
};

const apiCache = globalCache.stockApiCache || new Map<string, CacheEntry>();
if (process.env.NODE_ENV !== "production") {
  globalCache.stockApiCache = apiCache;
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
    // 10초 TTL 유지: 다중 컴포넌트 동시 요청 시 500 에러 방어
    if (apiCache.has(cacheKey) && !isForceRefresh) {
      const cachedData = apiCache.get(cacheKey)!;
      const isToday = cachedData.fetchDate === todayStr;
      const isFresh = Date.now() - cachedData.timestamp < 10 * 1000;

      if (isToday && isFresh) {
        console.log(
          `[INFO] [${ticker}] US Cache HIT (Memory) for ${timeframe}`,
        );
        cachedData.payload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedData.payload);
      }
    }

    // --- Step 2: Fetch DB & Deduplicate Early ---
    // 서버 메모리 부하를 줄이기 위해 1500개만 가져와서 즉시 중복 제거
    const rawDbData = await getCandles("US", ticker, timeframe, 1500, false);
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

    // 1. DB에 500개 미만으로 저장되어 있거나 (처음 조회하는 종목)
    // 2. 가장 마지막 데이터가 현재보다 1주일 이상 과거일 경우 (오래 방치되어 이빨이 많이 빠진 종목)
    const isMissingMoreThanOneWeek =
      uniqueDbCandles.length < 500 || now - latestDbTimestamp > oneWeekMs;

    if (isMissingMoreThanOneWeek) {
      if (timeframe === "1d") {
        stopTimestamp = now - 730 * 24 * 60 * 60 * 1000; // 500개 이상 확보를 위해 2년 치
      } else if (timeframe === "1h") {
        stopTimestamp = now - 60 * 24 * 60 * 60 * 1000; // 60일 치
      } else {
        stopTimestamp = now - 15 * 24 * 60 * 60 * 1000; // 15일 치
      }
      console.log(
        `[WARN] [${ticker}] Missing > 1 week data or not enough candles. Force fetching full history down to: ${new Date(stopTimestamp).toISOString()}`,
      );
    } else {
      // 누락된 기간이 1주일 미만이면 빈 구간(최신 데이터)만 가져와서 낭비 최소화
      stopTimestamp = latestDbTimestamp;
      console.log(
        `[INFO] [${ticker}] Fetching missing data since ${new Date(stopTimestamp).toISOString()}`,
      );
    }

    // --- Step 4: Fetch from API ---
    let apiData: StockDataPoint[] = [];

    if (timeframe === "1d") {
      apiData = await getDailyStockData(ticker, stopTimestamp);
    } else {
      const gap = timeframe === "1h" ? 60 : 15;
      apiData = await getMinuteStockData(ticker, gap, 10, stopTimestamp);
    }

    // --- Step 5: Strictly Filter & Save (Fixes DB Bloat and OOM) ---
    if (apiData && apiData.length > 0) {
      // DB의 가장 최신 시간과 같거나 그 이후의 데이터(오늘/어제 누락분)만 정확히 골라냅니다.
      const newDataToSave = apiData.filter((candle) => {
        return new Date(candle.date).getTime() >= latestDbTimestamp;
      });

      if (newDataToSave.length > 0) {
        console.log(
          `[INFO] [${ticker}] Upserting ${newDataToSave.length} exact matching records to DB...`,
        );

        const formattedCandles = newDataToSave.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));

        await saveCandlesBulk("US", ticker, timeframe, formattedCandles);
      }
    }

    // --- Step 6: Memory Merge (Bulletproof Chart Rendering) ---
    // DB 조회 결과와 방금 API에서 가져온 따끈따끈한 결과를 메모리 상에서 합칩니다.
    const finalMap = new Map();

    // 1. 기존 유효 DB 데이터 세팅
    for (const c of uniqueDbCandles) {
      finalMap.set(new Date(c.timestamp).getTime(), c);
    }

    // 2. API 최신 데이터 덮어쓰기 (오늘 가격 실시간 반영)
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
        .slice(-500); // 최종 차트에 쓸 500개만 깔끔하게 컷

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
    console.error(`[ERROR] [US API Route - ${ticker}]`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
