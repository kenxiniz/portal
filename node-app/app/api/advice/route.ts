/* /app/api/advice/route.ts */
// MODIFIED: This endpoint now reads data/signals from cache, not from POST body.
// MODIFIED: Added auto-fetch logic for cache misses. Emojis removed from logs.

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import {
  CachedStockData,
  AdviceObject,
  TradingSignal,
  StockDataPoint,
} from "@/lib/stockUtils";
import { getGeminiAdvice } from "@/lib/geminiUtils";
import stockConfig from "@/lib/stock.json";

// Define cache paths
const cacheDir = path.join(process.cwd(), ".cache");
const KIS_CACHE_PATH = path.join(cacheDir, "kis-stock-cache.json");
const KOREAN_CACHE_PATH = path.join(cacheDir, "korean-stock-cache.json");
const AV_CACHE_PATH = path.join(cacheDir, "stock-cache.json");

type ApiType = "stock" | "kisStock" | "kStock";

interface StockCache {
  [key: string]: CachedStockData;
}

// In-memory map to store in-progress generation promises
// Use a composite key to avoid collisions (e.g., "kisStock-TSLA")
const adviceGenerationInProgress = new Map<string, Promise<AdviceObject>>();

// --- Generic Cache Read/Write Functions ---
async function readStockCache(filePath: string): Promise<StockCache> {
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileContent);
  } catch {
    return {};
  }
}

async function writeStockCache(
  filePath: string,
  data: StockCache,
): Promise<void> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing cache file (${filePath}):`, error);
  }
}
// --- End Cache Functions ---

function getStockName(ticker: string): string {
  const stockInfo = stockConfig.k_stocks.find((s) => s.ticker === ticker);
  return stockInfo ? stockInfo.name : ticker;
}

function getCachePath(apiType: ApiType): string {
  switch (apiType) {
    case "stock":
      return AV_CACHE_PATH;
    case "kisStock":
      return KIS_CACHE_PATH;
    case "kStock":
      return KOREAN_CACHE_PATH;
    default:
      // This should not be reachable if types are correct
      throw new Error(`Invalid apiType: ${apiType}`);
  }
}

// MODIFIED: Function signature no longer needs signals
async function generateAndCacheAdvice(
  apiType: ApiType,
  ticker: string,
  stockCache: StockCache,
  cachedTickerData: CachedStockData,
): Promise<AdviceObject> {
  const cachePath = getCachePath(apiType);
  console.log(
    `[${ticker}/${apiType}/advice] ADVICE CACHE MISS: Generating new advice...`,
  );

  // Extract data from cache
  const signals: TradingSignal[] = cachedTickerData.signals || [];
  const fullStockData: StockDataPoint[] = cachedTickerData.data || [];
  // Get last 7 days of data
  const recentStockData = fullStockData.slice(-7);

  try {
    let newAdvice: AdviceObject;
    if (apiType === "kStock") {
      const stockName = getStockName(ticker);
      newAdvice = await getGeminiAdvice(
        signals,
        recentStockData,
        ticker,
        "kr",
        stockName,
      );
    } else {
      // "stock" (AV) and "kisStock" are both 'us' market
      newAdvice = await getGeminiAdvice(signals, recentStockData, ticker, "us");
    }

    // Save new advice to the specific cache file
    cachedTickerData.advice = newAdvice;
    await writeStockCache(cachePath, stockCache);

    console.log(
      `[${ticker}/${apiType}/advice] New advice generated and cached.`,
    );
    return newAdvice;
  } catch (e) {
    console.error(
      `[${ticker}/${apiType}/advice] Failed to generate advice:`,
      e,
    );
    const errorAdvice: AdviceObject = {
      error: true,
      message: `Gemini advice generation failed: ${
        e instanceof Error ? e.message : "Unknown error"
      }`,
    };
    cachedTickerData.advice = errorAdvice; // Cache the error
    await writeStockCache(cachePath, stockCache);
    return errorAdvice;
  }
}

export async function POST(request: Request) {
  let body: {
    ticker: string;
    apiType: ApiType;
  };

  try {
    body = await request.json();
  } catch (error) {
    console.error("[/api/advice] Failed to parse request body:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticker, apiType } = body;
  const progressKey = `${apiType}-${ticker}`;

  if (!ticker || !apiType) {
    return NextResponse.json(
      { error: "Missing required fields: ticker, apiType" },
      { status: 400 },
    );
  }

  const cachePath = getCachePath(apiType);
  const stockCache = await readStockCache(cachePath);

  // MODIFIED: Changed from const to let so we can update it if we auto-fetch
  let cachedTickerData = stockCache[ticker];

  // 1. Check for valid data cache and Auto-Fetch if missing
  if (
    !cachedTickerData ||
    !cachedTickerData.data ||
    !cachedTickerData.signals
  ) {
    console.log(
      `[${ticker}/${apiType}/advice] Cache miss. Attempting to auto-fetch data before generating advice.`,
    );

    try {
      // Construct the local API URL to fetch the stock data
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const fetchUrl = `${baseUrl}/api/${apiType}/${ticker}`;

      console.log(
        `[${ticker}/${apiType}/advice] Fetching data from: ${fetchUrl}`,
      );
      const fetchRes = await fetch(fetchUrl, { method: "GET" });

      if (!fetchRes.ok) {
        throw new Error(`Data fetch API returned status: ${fetchRes.status}`);
      }

      // Reload cache after successful fetch
      const updatedCache = await readStockCache(cachePath);
      cachedTickerData = updatedCache[ticker];

      if (
        !cachedTickerData ||
        !cachedTickerData.data ||
        !cachedTickerData.signals
      ) {
        throw new Error("Cache is still empty after successful fetch attempt.");
      }

      // Update the reference in our local stockCache object
      stockCache[ticker] = cachedTickerData;
      console.log(
        `[${ticker}/${apiType}/advice] Auto-fetch successful. Resuming advice generation.`,
      );
    } catch (fetchError) {
      const errorMessage =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error(
        `[${ticker}/${apiType}/advice] Auto-fetch failed:`,
        errorMessage,
      );
      return NextResponse.json(
        { error: `Cache miss and auto-fetch failed: ${errorMessage}` },
        { status: 500 },
      );
    }
  }

  // 2. Check for valid advice cache
  if (cachedTickerData?.advice && cachedTickerData.advice.error === false) {
    console.log(
      `[${ticker}/${apiType}/advice] ADVICE CACHE HIT: Returning cached advice.`,
    );
    return NextResponse.json({ ...cachedTickerData.advice, isCached: true });
  }

  // 3. Check if generation is already in progress
  if (adviceGenerationInProgress.has(progressKey)) {
    console.log(
      `[${ticker}/${apiType}/advice] Advice generation in progress. Awaiting existing promise.`,
    );
    const advice = await adviceGenerationInProgress.get(progressKey)!;
    return NextResponse.json(advice, {
      status: advice.error ? 500 : 200,
    });
  }

  // 4. Generate new advice (if missing or error)
  const generationPromise = generateAndCacheAdvice(
    apiType,
    ticker,
    stockCache,
    cachedTickerData,
  );
  adviceGenerationInProgress.set(progressKey, generationPromise);

  let advice: AdviceObject;
  try {
    advice = await generationPromise;
  } finally {
    adviceGenerationInProgress.delete(progressKey);
    console.log(
      `[${ticker}/${apiType}/advice] Generation finished. Promise removed from map.`,
    );
  }

  return NextResponse.json(
    { ...advice, isCached: false },
    {
      status: advice.error ? 500 : 200,
    },
  );
}
