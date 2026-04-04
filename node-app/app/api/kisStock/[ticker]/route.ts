/* /app/api/kisStock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/mongodb";
import { getCandles, saveCandle } from "../../../../lib/candle/service";
// Import explicitly defined types to replace 'any'
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "../../../../lib/stockUtils";
import { getDailyStockData, getMinuteStockData } from "../../../../lib/kisApi";
import mongoose from "mongoose";

// Force Next.js to completely disable caching for this API route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Advice Schema (Independent from candles)
const AdviceSchema = new mongoose.Schema({
  ticker: { type: String, required: true, unique: true },
  advice: { type: Object, default: null },
  updatedAt: { type: Date, default: Date.now },
});
const TickerAdvice =
  mongoose.models.TickerAdvice || mongoose.model("TickerAdvice", AdviceSchema);

// --- Global In-Memory Cache Setup ---
// Use globalThis to persist cache across module reloads in Next.js development
type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[]; // Resolved: Replaced 'any[]' with 'TradingSignal[]'
  advice: AdviceObject | null; // Resolved: Replaced 'any' with 'AdviceObject | null'
};

type CacheEntry = {
  fetchDate: string; // YYYY-MM-DD format
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
// ------------------------------------------

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

  // --- Step 0: Check In-Memory Cache ---
  if (!forceRefresh && apiCache.has(cacheKey)) {
    const cachedData = apiCache.get(cacheKey);

    // Check if the cache is from today.
    // For intraday (1h, 15m), you might want to add a stricter TTL (e.g., 5-15 mins).
    const isToday = cachedData?.fetchDate === todayStr;
    const isIntradayFresh =
      timeframe === "1d" ||
      Date.now() - (cachedData?.timestamp || 0) < 1000 * 60 * 15;

    if (isToday && isIntradayFresh) {
      console.log(`[${ticker}] Cache HIT (Memory) for ${timeframe}`);
      return NextResponse.json(cachedData.payload);
    }
  }

  try {
    await connectDB();
    console.log(`[${ticker}] Request: ${timeframe}, Refresh: ${forceRefresh}`);

    // Fetch AI Advice from DB
    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const advice = adviceDoc?.advice || null;

    // --- Step 1: Check Database ---
    // Increase limit from 100 to 500 to show enough intraday bars
    let dbData = await getCandles("US", ticker, timeframe, 500, forceRefresh);

    // Resolved: Changed 'let' to 'const' because the value is not reassigned
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
        // [WARNING] This loop causes N+1 DB queries and is very slow.
        // Consider implementing a bulkInsert in candle/service.ts
        const savePromises = apiData.map((candle) =>
          saveCandle("US", ticker, timeframe, {
            timestamp: candle.date,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          }),
        );
        // Execute saves concurrently to improve speed slightly, but bulk insert is best
        await Promise.all(savePromises);

        // Increase limit from 100 to 500 here as well
        dbData = await getCandles("US", ticker, timeframe, 500, true);
      }
    }

    if (dbData && dbData.length > 0) {
      // 4. Transform for Technical Analysis (ICandle -> StockDataPoint)
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

      // Pass the timeframe to analyzeAllTradingSignals to support time-based exits
      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
      );

      // Define payload matching the proper interface
      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: advice as AdviceObject | null,
      };

      // --- Save to In-Memory Cache ---
      apiCache.set(cacheKey, {
        fetchDate: todayStr,
        timestamp: Date.now(),
        payload: responsePayload,
      });

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json({ data: [], signals: [], advice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[API Route - ${ticker}] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
