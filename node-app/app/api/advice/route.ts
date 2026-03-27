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
      { upsert: true, returnDocument: "after" },
    );
    console.log(
      `[INFO] [${ticker}] Database sync successful: Saved to MongoDB.`,
    );
  } catch (error) {
    console.error(`[ERROR] [${ticker}] Database sync failed:`, error);
  }
}

async function generateAndCacheAdvice(
  apiType: ApiType,
  ticker: string,
  cachedTickerData: CachedStockData,
): Promise<AdviceObject> {
  console.log(
    `[INFO] [${ticker}/${apiType}/advice] Starting Gemini analysis process...`,
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

    // [CRITICAL FIX] Prevent saving error objects to DB or Cache
    if (newAdvice.error) {
      console.error(
        `[ERROR] [${ticker}/${apiType}/advice] API returned an error object. Skipping DB and Cache updates.`,
      );
      return newAdvice;
    }

    cachedTickerData.advice = newAdvice;
    // Ensure saveToDatabase does not overwrite existing good data with errors
    saveToDatabase(ticker, newAdvice);

    console.log(
      `[INFO] [${ticker}/${apiType}/advice] Memory updated and DB persistence triggered.`,
    );
    return newAdvice;
  } catch (e) {
    console.error(
      `[ERROR] [${ticker}/${apiType}/advice] Gemini advice generation failed:`,
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
    console.error("[ERROR] [/api/advice] Body parsing error:", error);
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
      `[INFO] [${ticker}/${apiType}/advice] Memory cache miss. Fetching data...`,
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
        `[INFO] [${ticker}/${apiType}/advice] Auto-fetch complete. Memory sync done.`,
      );
    } catch (err) {
      console.error(
        `[ERROR] [${ticker}/${apiType}/advice] Auto-fetch failed:`,
        err,
      );
      return NextResponse.json(
        { error: "Data recovery failed" },
        { status: 500 },
      );
    }
  }

  if (!refresh && cachedTickerData?.advice && !cachedTickerData.advice.error) {
    console.log(
      `[INFO] [${ticker}/${apiType}/advice] Memory Hit: Returning cached response.`,
    );
    return NextResponse.json({ ...cachedTickerData.advice, isCached: true });
  }

  if (refresh) {
    console.log(
      `[INFO] [${ticker}/${apiType}/advice] Refresh flag detected. Bypassing memory cache.`,
    );
  }

  let fallbackAdvice: AdviceObject | null = null;

  try {
    console.log(
      `[DEBUG] [${ticker}/${apiType}/advice] Starting DB connection and lookup.`,
    );
    await connectDB();
    const existingRecord = await TickerAdvice.findOne({ ticker });

    if (
      existingRecord &&
      existingRecord.advice &&
      !existingRecord.advice.error
    ) {
      fallbackAdvice = existingRecord.advice;
      console.log(
        `[INFO] [${ticker}/${apiType}/advice] DB Record found. Saved as potential fallback.`,
      );

      if (existingRecord.updatedAt) {
        const kstOptions: Intl.DateTimeFormatOptions = {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        };

        const recordDateStr = new Intl.DateTimeFormat(
          "en-CA",
          kstOptions,
        ).format(new Date(existingRecord.updatedAt));
        const todayDateStr = new Intl.DateTimeFormat(
          "en-CA",
          kstOptions,
        ).format(new Date());

        console.log(
          `[DEBUG] [${ticker}/${apiType}/advice] Record Date: ${recordDateStr}, Today Date: ${todayDateStr}, Refresh: ${refresh}`,
        );

        if (!refresh && recordDateStr === todayDateStr) {
          console.log(
            `[INFO] [${ticker}/${apiType}/advice] DB Hit: Found today's advice in database.`,
          );
          cachedTickerData.advice = existingRecord.advice;
          return NextResponse.json({
            ...existingRecord.advice,
            isCached: true,
          });
        } else if (!refresh) {
          console.log(
            `[INFO] [${ticker}/${apiType}/advice] DB Hit but outdated: Need new advice for today.`,
          );
        } else {
          console.log(
            `[INFO] [${ticker}/${apiType}/advice] Refresh flag is true. Bypassing date check to force update.`,
          );
        }
      }
    } else {
      console.log(
        `[INFO] [${ticker}/${apiType}/advice] DB Miss or corrupted data: No valid existing record found.`,
      );
    }
  } catch (dbError) {
    console.error(
      `[ERROR] [${ticker}/${apiType}/advice] DB verification failed:`,
      dbError,
    );
  }

  if (adviceGenerationInProgress.has(progressKey)) {
    console.log(
      `[INFO] [${ticker}/${apiType}/advice] Analysis in progress. Waiting for existing promise...`,
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

    if (advice.error && fallbackAdvice) {
      console.log(
        `[WARN] [${ticker}/${apiType}/advice] Gemini API failed. Using outdated DB record as fallback.`,
      );
      // Fallback response explicitly returned
      return NextResponse.json({
        ...fallbackAdvice,
        isCached: true,
        isFallback: true,
      });
    }

    return NextResponse.json({ ...advice, isCached: false });
  } finally {
    adviceGenerationInProgress.delete(progressKey);
    console.log(
      `[INFO] [${ticker}/${apiType}/advice] Analysis sequence finished.`,
    );
  }
}
