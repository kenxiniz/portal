/* /app/api/advice/route.ts */

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

    cachedTickerData.advice = newAdvice;
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
  let body: { ticker: string; apiType: ApiType; refresh?: boolean };
  try {
    body = await request.json();
  } catch (error) {
    console.error("[/api/advice] Body parsing error:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticker, apiType, refresh } = body;
  const progressKey = `${apiType}-${ticker}`;

  if (!ticker || !apiType) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  let cachedTickerData = memoryStore[apiType][ticker];

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
      memoryStore[apiType][ticker] = {
        ...memoryStore[apiType][ticker],
        ...responseData,
      };
      cachedTickerData = memoryStore[apiType][ticker];
      console.log(
        `[${ticker}/${apiType}/advice] Auto-fetch complete. Memory sync done.`,
      );
    } catch (err) {
      console.error(`[${ticker}/${apiType}/advice] Auto-fetch failed:`, err);
      return NextResponse.json(
        { error: "Data recovery failed" },
        { status: 500 },
      );
    }
  }

  // [MODIFIED] Bypass memory cache if 'refresh' flag is true
  if (!refresh && cachedTickerData?.advice && !cachedTickerData.advice.error) {
    console.log(
      `[${ticker}/${apiType}/advice] Memory Hit: Returning cached response.`,
    );
    return NextResponse.json({ ...cachedTickerData.advice, isCached: true });
  }

  if (refresh) {
    console.log(
      `[${ticker}/${apiType}/advice] Refresh flag detected. Bypassing memory cache.`,
    );
  }

  if (adviceGenerationInProgress.has(progressKey)) {
    console.log(
      `[${ticker}/${apiType}/advice] Analysis in progress. Waiting for existing promise...`,
    );
    const advice = await adviceGenerationInProgress.get(progressKey)!;
    return NextResponse.json(advice);
  }

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
