/* /app/api/advice/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import { CachedStockData, AdviceObject } from "@/lib/stockUtils";
import { getBatchGeminiAdvice, BatchInputItem } from "@/lib/geminiUtils";
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

const batchGenerationInProgress = new Map<
  string,
  Promise<Record<string, AdviceObject>>
>();

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

export async function POST(request: Request) {
  let body: {
    ticker?: string;
    isBatch?: boolean;
    apiType: ApiType;
    refresh?: boolean;
  };
  try {
    body = await request.json();
  } catch (error) {
    console.error("[ERROR] [/api/advice] Body parsing error:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticker, isBatch, apiType, refresh } = body;

  if (!apiType) {
    return NextResponse.json(
      { error: "Missing apiType field" },
      { status: 400 },
    );
  }

  let targetTickers: string[] = [];
  if (isBatch) {
    if (apiType === "kStock") {
      targetTickers = stockConfig.k_stocks.map(
        (s: { ticker: string }) => s.ticker,
      );
    } else {
      targetTickers = stockConfig.us_stocks.map(
        (s: { ticker: string }) => s.ticker,
      );
    }
  } else if (ticker) {
    targetTickers = [ticker];
  } else {
    return NextResponse.json(
      { error: "No ticker provided and isBatch is false" },
      { status: 400 },
    );
  }

  const progressKey = `batch-${apiType}-${targetTickers.join("-")}`;

  if (batchGenerationInProgress.has(progressKey)) {
    console.log(
      `[INFO] [Batch/${apiType}] Analysis in progress. Waiting for existing promise...`,
    );
    const batchResult = await batchGenerationInProgress.get(progressKey)!;
    return NextResponse.json(
      ticker && !isBatch ? batchResult[ticker] : batchResult,
    );
  }

  const generationPromise = (async () => {
    const responseData: Record<
      string,
      AdviceObject & { isCached?: boolean; isFallback?: boolean }
    > = {};
    const itemsForGemini: BatchInputItem[] = [];
    const fallbacks: Record<string, AdviceObject> = {};

    const kstOptions: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    };
    const todayDateStr = new Intl.DateTimeFormat("en-CA", kstOptions).format(
      new Date(),
    );

    console.log(
      `[INFO] [Batch/${apiType}] Processing ${targetTickers.length} tickers.`,
    );

    for (const t of targetTickers) {
      let cachedTickerData = memoryStore[apiType][t];

      if (
        !cachedTickerData ||
        !cachedTickerData.data ||
        !cachedTickerData.signals
      ) {
        console.log(
          `[INFO] [${t}/${apiType}/advice] Memory cache miss. Fetching data...`,
        );
        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || "http://node-app:3000";
          const fetchRes = await fetch(`${baseUrl}/api/${apiType}/${t}`, {
            method: "GET",
          });
          if (!fetchRes.ok)
            throw new Error(`Source API error: ${fetchRes.status}`);

          const responseJson = await fetchRes.json();
          memoryStore[apiType][t] = {
            ...memoryStore[apiType][t],
            ...responseJson,
          };
          cachedTickerData = memoryStore[apiType][t];
          console.log(`[INFO] [${t}/${apiType}/advice] Auto-fetch complete.`);
        } catch (err) {
          console.error(
            `[ERROR] [${t}/${apiType}/advice] Auto-fetch failed:`,
            err,
          );
          responseData[t] = { error: true, message: "Data recovery failed" };
          continue;
        }
      }

      let dbHit = false;

      try {
        await connectDB();
        const existingRecord = await TickerAdvice.findOne({ ticker: t });

        if (
          existingRecord &&
          existingRecord.advice &&
          !existingRecord.advice.error
        ) {
          fallbacks[t] = existingRecord.advice;

          if (existingRecord.updatedAt) {
            const recordDateStr = new Intl.DateTimeFormat(
              "en-CA",
              kstOptions,
            ).format(new Date(existingRecord.updatedAt));

            if (!refresh && recordDateStr === todayDateStr) {
              console.log(
                `[INFO] [${t}/${apiType}/advice] DB Hit: Found today's advice.`,
              );
              cachedTickerData.advice = existingRecord.advice;
              responseData[t] = { ...existingRecord.advice, isCached: true };
              dbHit = true;
            }
          }
        }
      } catch (dbError) {
        console.error(
          `[ERROR] [${t}/${apiType}/advice] DB lookup failed:`,
          dbError,
        );
      }

      if (!dbHit) {
        // [MODIFIED] Fixed ESLint warning by defining explicit type for stockConfig iteration instead of 'any'
        itemsForGemini.push({
          ticker: t,
          stockName:
            apiType === "kStock"
              ? stockConfig.k_stocks.find(
                  (s: { ticker: string; name: string }) => s.ticker === t,
                )?.name
              : undefined,
          signals: cachedTickerData.signals || [],
          recentStockData: (cachedTickerData.data || []).slice(-7),
        });
      }
    }

    if (itemsForGemini.length > 0) {
      console.log(
        `[INFO] [Batch/${apiType}] Triggering Gemini API for ${itemsForGemini.length} items.`,
      );
      const market = apiType === "kStock" ? "kr" : "us";
      const batchResults = await getBatchGeminiAdvice(itemsForGemini, market);

      for (const item of itemsForGemini) {
        const t = item.ticker;
        const newAdvice = batchResults[t];

        if (!newAdvice || newAdvice.error) {
          console.warn(
            `[WARN] [${t}/${apiType}/advice] Gemini failure. Attempting fallback.`,
          );
          if (fallbacks[t]) {
            responseData[t] = {
              ...fallbacks[t],
              isCached: true,
              isFallback: true,
            };
          } else {
            responseData[t] = newAdvice || {
              error: true,
              message: "Unknown batch generation error",
            };
          }
          continue;
        }

        memoryStore[apiType][t].advice = newAdvice;
        await saveToDatabase(t, newAdvice);
        responseData[t] = { ...newAdvice, isCached: false };
      }
    }

    return responseData;
  })();

  batchGenerationInProgress.set(progressKey, generationPromise);

  try {
    const fullResponse = await generationPromise;
    return NextResponse.json(
      ticker && !isBatch ? fullResponse[ticker] : fullResponse,
    );
  } finally {
    batchGenerationInProgress.delete(progressKey);
    console.log(`[INFO] [Batch/${apiType}] Analysis sequence finished.`);
  }
}
