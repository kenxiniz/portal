/* /app/api/advice/route.ts */
// MODIFIED: Fixed ESLint unused-vars errors by logging error details.
// MODIFIED: Integrated in-memory store and MongoDB persistence via TickerAdvice model.
// MODIFIED: All logs/comments in English. Emojis removed from logs.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import {
  CachedStockData,
  AdviceObject,
  TradingSignal,
  StockDataPoint,
} from "@/lib/stockUtils";
import { getGeminiAdvice } from "@/lib/geminiUtils";
import stockConfig from "@/lib/stock.json";

type ApiType = "stock" | "kisStock" | "kStock";

interface StockCache {
  [ticker: string]: CachedStockData;
}

interface MemoryStore {
  stock: StockCache;
  kisStock: StockCache;
  kStock: StockCache;
}

// Global store for in-memory persistence (same as candle logic)
const globalForCache = global as unknown as { memoryStore: MemoryStore };
const memoryStore: MemoryStore = globalForCache.memoryStore || {
  stock: {},
  kisStock: {},
  kStock: {},
};

if (process.env.NODE_ENV !== "production") {
  globalForCache.memoryStore = memoryStore;
}

const adviceGenerationInProgress = new Map<string, Promise<AdviceObject>>();

/**
 * Persists Gemini advice to MongoDB.
 */
async function saveToDatabase(ticker: string, advice: AdviceObject) {
  try {
    await connectDB();

    // Updates tickeradvices collection using the TickerAdvice model
    await TickerAdvice.findOneAndUpdate(
      { ticker },
      {
        ticker,
        advice: advice,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    console.log(`[${ticker}] Database sync successful: Saved to MongoDB.`);
  } catch (error) {
    console.error(`[${ticker}] Database sync failed:`, error);
  }
}

async function generateAndCacheAdvice(
  apiType: ApiType,
  ticker: string,
  cachedTickerData: CachedStockData,
): Promise<AdviceObject> {
  console.log(
    `[${ticker}/${apiType}/advice] Starting Gemini analysis process...`,
  );

  const signals: TradingSignal[] = cachedTickerData.signals || [];
  const fullStockData: StockDataPoint[] = cachedTickerData.data || [];
  const recentStockData = fullStockData.slice(-7);

  try {
    let newAdvice: AdviceObject;
    if (apiType === "kStock") {
      const stockName =
        stockConfig.k_stocks.find((s) => s.ticker === ticker)?.name || ticker;
      newAdvice = await getGeminiAdvice(
        signals,
        recentStockData,
        ticker,
        "kr",
        stockName,
      );
    } else {
      newAdvice = await getGeminiAdvice(signals, recentStockData, ticker, "us");
    }

    // 1. Update In-Memory cache
    cachedTickerData.advice = newAdvice;

    // 2. Queue MongoDB persistence
    saveToDatabase(ticker, newAdvice);

    console.log(
      `[${ticker}/${apiType}/advice] Memory updated and DB persistence triggered.`,
    );
    return newAdvice;
  } catch (e) {
    console.error(
      `[${ticker}/${apiType}/advice] Gemini advice generation failed:`,
      e,
    );
    return {
      error: true,
      message: `Gemini failure: ${e instanceof Error ? e.message : "Unknown error"}`,
    };
  }
}

export async function POST(request: Request) {
  let body: { ticker: string; apiType: ApiType };
  try {
    body = await request.json();
  } catch (error) {
    // FIX: Log the error to satisfy ESLint no-unused-vars
    console.error("[/api/advice] Body parsing error:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticker, apiType } = body;
  const progressKey = `${apiType}-${ticker}`;

  if (!ticker || !apiType) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  let cachedTickerData = memoryStore[apiType][ticker];

  // Auto-Fetch if data is missing in memory
  if (
    !cachedTickerData ||
    !cachedTickerData.data ||
    !cachedTickerData.signals
  ) {
    console.log(
      `[${ticker}/${apiType}/advice] Memory cache miss. Fetching data...`,
    );
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://node-app:3000";
      const fetchRes = await fetch(`${baseUrl}/api/${apiType}/${ticker}`, {
        method: "GET",
      });

      if (!fetchRes.ok) throw new Error(`Source API error: ${fetchRes.status}`);

      const responseData = await fetchRes.json();

      // Update local memory with the retrieved data
      memoryStore[apiType][ticker] = {
        ...memoryStore[apiType][ticker],
        ...responseData,
      };
      cachedTickerData = memoryStore[apiType][ticker];

      console.log(
        `[${ticker}/${apiType}/advice] Auto-fetch complete. Memory sync done.`,
      );
    } catch (err) {
      // FIX: Log the err to satisfy ESLint no-unused-vars
      console.error(`[${ticker}/${apiType}/advice] Auto-fetch failed:`, err);
      return NextResponse.json(
        { error: "Data recovery failed" },
        { status: 500 },
      );
    }
  }

  // Return cached advice if valid
  if (cachedTickerData?.advice && !cachedTickerData.advice.error) {
    console.log(
      `[${ticker}/${apiType}/advice] Memory Hit: Returning cached response.`,
    );
    return NextResponse.json({ ...cachedTickerData.advice, isCached: true });
  }

  // Concurrency check
  if (adviceGenerationInProgress.has(progressKey)) {
    console.log(
      `[${ticker}/${apiType}/advice] Analysis in progress. Waiting for existing promise...`,
    );
    const advice = await adviceGenerationInProgress.get(progressKey)!;
    return NextResponse.json(advice);
  }

  // Run new analysis
  const generationPromise = generateAndCacheAdvice(
    apiType,
    ticker,
    cachedTickerData,
  );
  adviceGenerationInProgress.set(progressKey, generationPromise);

  try {
    const advice = await generationPromise;
    return NextResponse.json({ ...advice, isCached: false });
  } finally {
    adviceGenerationInProgress.delete(progressKey);
    console.log(`[${ticker}/${apiType}/advice] Analysis sequence finished.`);
  }
}
