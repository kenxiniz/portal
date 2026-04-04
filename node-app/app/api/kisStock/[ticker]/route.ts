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

// [FIX 1] Remove local AdviceSchema and import the official TickerAdvice model
import { TickerAdvice } from "../../../../lib/models/advice";

// Force Next.js to completely disable caching for this API route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// --- Global In-Memory Cache Setup ---
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

// Helper to get today's date string in KST
const getTodayKST = () => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset).toISOString().split("T")[0];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();

  // Get query parameters
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const forceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const cacheKey = `${ticker}-${timeframe}`;
  const todayStr = getTodayKST();

  try {
    await connectDB();

    // [FIX 2] Fetch AI advice directly from DB before checking memory cache
    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const latestAdvice = adviceDoc?.advice || null;

    // --- Step 0: Check In-Memory Cache ---
    if (!forceRefresh && apiCache.has(cacheKey)) {
      const cachedData = apiCache.get(cacheKey)!;

      const isToday = cachedData.fetchDate === todayStr;
      const isIntradayFresh =
        timeframe === "1d" ||
        Date.now() - cachedData.timestamp < 1000 * 60 * 15;

      if (isToday && isIntradayFresh) {
        console.log(`[${ticker}] Cache HIT (Memory) for ${timeframe}`);

        // [FIX 3] Inject the latest advice into the cached payload before returning
        cachedData.payload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedData.payload);
      }
    }

    console.log(`[${ticker}] Request: ${timeframe}, Refresh: ${forceRefresh}`);

    // --- Step 1: Check Database ---
    let dbData = await getCandles("US", ticker, timeframe, 500, forceRefresh);
    const fromDB = dbData && dbData.length > 0;

    if (fromDB) {
      console.log(`[${ticker}] Cache HIT (Database) for ${timeframe}`);
    }

    // --- Step 2: Fetch from REST API (if DB miss or force refresh) ---
    if (forceRefresh || !fromDB) {
      console.log(`[${ticker}] Syncing ${timeframe} data from KIS API...`);

      let apiData: StockDataPoint[] = [];

      if (timeframe === "1d") {
        apiData = await getDailyStockData(ticker);
      } else {
        const gap = timeframe === "1h" ? 60 : 15;
        apiData = await getMinuteStockData(ticker, gap);
      }

      if (apiData && apiData.length > 0) {
        // Use bulk insert instead of loop for massive performance boost
        const formattedCandles = apiData.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));

        await saveCandlesBulk("US", ticker, timeframe, formattedCandles);
        dbData = await getCandles("US", ticker, timeframe, 500, true);
      }
    }

    if (dbData && dbData.length > 0) {
      // 4. Transform for Technical Analysis
      const sortedData = [...dbData].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

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

      // 5. Calculate Indicators
      const processedData = calculateBollingerBands(calculateRSI(mappedData));
      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
      );

      // Define payload matching the proper interface
      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null, // [FIX 4] Map the latest advice
      };

      // --- Save to In-Memory Cache ---
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
    console.error(`[API Route - ${ticker}] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
