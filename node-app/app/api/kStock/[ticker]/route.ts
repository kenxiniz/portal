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
import stockConfig from "../../../../lib/stock.json";

// Import global memory cache helpers to bridge the scheduler and the endpoint
import { getCacheData } from "../../../../lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[];
  advice: AdviceObject | null;
};

interface StockConfigItem {
  ticker: string;
  isInverse?: boolean;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const isForceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  // Synchronize the cache key format with the scheduler collect job for KR market
  const cacheKey = `kStock:${ticker}:${timeframe}`;

  try {
    await connectDB();

    // Fetch latest advice dynamically on every hit to ensure fresh UI updates
    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const latestAdvice = adviceDoc?.advice || null;

    // -------------------------------------------------------------------------
    // [CQRS Read Path] Handles client page interactions (Strictly Read-Only)
    // -------------------------------------------------------------------------
    if (!isForceRefresh) {
      // Step 1: Query the shared memory cache populated by the 5-min scheduler
      const cachedPayload = (await getCacheData(
        cacheKey,
      )) as CachePayload | null;
      if (cachedPayload) {
        console.log(
          `[INFO] [${ticker}] KR Shared Memory Cache HIT for ${timeframe}`,
        );
        // Inject latest advice dynamically in case it changed via admin/AI jobs
        cachedPayload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedPayload);
      }

      // Step 2: Cache Miss Fallback - Query DB only, do not touch external APIs or write logs
      console.log(
        `[WARN] [${ticker}] KR Shared Memory Cache MISS for ${timeframe}. Executing Read-Only DB fallback.`,
      );
      const rawDbData = await getCandles("KR", ticker, timeframe, 500, false);

      if (rawDbData && rawDbData.length > 0) {
        const mappedData = rawDbData
          .map((c) => ({
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
          }))
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

        const processedData = calculateBollingerBands(calculateRSI(mappedData));

        const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
          (s) => s.ticker === ticker,
        );
        const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
          (s) => s.ticker === ticker,
        );
        const isInverse = !!(kStock?.isInverse || usStock?.isInverse);

        const signals = analyzeAllTradingSignals(
          processedData,
          timeframe as "1d" | "1h" | "15m",
          isInverse,
        );

        const responsePayload: CachePayload = {
          data: processedData,
          signals,
          advice: latestAdvice as AdviceObject | null,
        };

        return NextResponse.json(responsePayload);
      }

      return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
    }

    // -------------------------------------------------------------------------
    // [CQRS Write Path] Only executed when triggered by the 5-min Scheduler (refresh=true)
    // -------------------------------------------------------------------------
    console.log(
      `[INFO] [${ticker}] KR Force refresh triggered by Scheduler for ${timeframe}. Executing write pipeline.`,
    );

    // Fetch DB & Deduplicate Early
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

    // Self-Healing & Calculate API Fetch Boundary
    let stopTimestamp = 0;
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const isMissingMoreThanOneWeek =
      uniqueDbCandles.length === 0 ||
      (latestDbTimestamp > 0 && now - latestDbTimestamp > oneWeekMs);

    if (isMissingMoreThanOneWeek) {
      if (timeframe === "1d") {
        stopTimestamp = now - 730 * 24 * 60 * 60 * 1000;
      } else if (timeframe === "1h") {
        stopTimestamp = now - 60 * 24 * 60 * 60 * 1000;
      } else {
        stopTimestamp = now - 15 * 24 * 60 * 60 * 1000;
      }
      console.log(
        `[WARN] [${ticker}] Missing > 1 week data. Force fetching full history down to: ${new Date(stopTimestamp).toISOString()}`,
      );
    } else {
      stopTimestamp = latestDbTimestamp;
      console.log(
        `[INFO] [${ticker}] Fetching missing data since ${new Date(stopTimestamp).toISOString()}`,
      );
    }

    // Fetch from external Korean KIS API
    let apiData: StockDataPoint[] = [];
    if (timeframe === "1d") {
      apiData = await getDailyKoreanStockData(ticker, stopTimestamp);
    } else {
      const gap = timeframe === "1h" ? 60 : 15;
      apiData = await getMinuteKoreanStockData(ticker, gap, 60, stopTimestamp);
    }

    // Strictly Filter & Save New/Changed records
    if (apiData && apiData.length > 0) {
      const newDataToSave = apiData.filter((candle) => {
        const apiTime = new Date(candle.date).getTime();
        if (apiTime < latestDbTimestamp) return false;

        const existingDbCandle = uniqueDbCandles.find(
          (c) => new Date(c.timestamp).getTime() === apiTime,
        );

        if (!existingDbCandle) return true;

        const isChanged =
          existingDbCandle.close !== candle.close ||
          existingDbCandle.high !== candle.high ||
          existingDbCandle.low !== candle.low ||
          existingDbCandle.volume !== candle.volume;

        return isChanged;
      });

      if (newDataToSave.length > 0) {
        console.log(
          `[INFO] [${ticker}] Upserting ${newDataToSave.length} records (Changed or New) to DB...`,
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
      } else {
        console.log(
          `[INFO] [${ticker}] Data is fully up-to-date. No DB writes required.`,
        );
      }
    }

    // Memory Merge for Output
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

      const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
        (s) => s.ticker === ticker,
      );
      const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
        (s) => s.ticker === ticker,
      );
      const isInverse = !!(kStock?.isInverse || usStock?.isInverse);

      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
        isInverse,
      );

      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null,
      };

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[ERROR] [KR API Route - ${ticker}]`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
