/* /app/api/advice/route.ts */
// NEW: This is the centralized POST endpoint for generating all AI advice.

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { CachedStockData, AdviceObject, TradingSignal } from "@/lib/stockUtils";
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

async function generateAndCacheAdvice(
  apiType: ApiType,
  ticker: string,
  signals: TradingSignal[],
  stockCache: StockCache,
  cachedTickerData: CachedStockData, // Pass the specific cache entry
): Promise<AdviceObject> {
  const cachePath = getCachePath(apiType);
  console.log(
    `🤖 [${ticker}/${apiType}/advice] ADVICE CACHE MISS: Generating new advice...`,
  );
  try {
    let newAdvice: AdviceObject;
    if (apiType === "kStock") {
      const stockName = getStockName(ticker);
      newAdvice = await getGeminiAdvice(signals, ticker, "kr", stockName);
    } else {
      // "stock" (AV) and "kisStock" are both 'us' market
      newAdvice = await getGeminiAdvice(signals, ticker, "us");
    }

    // Save new advice to the specific cache file
    cachedTickerData.advice = newAdvice;
    await writeStockCache(cachePath, stockCache);

    console.log(
      `✅ [${ticker}/${apiType}/advice] New advice generated and cached.`,
    );
    return newAdvice;
  } catch (e) {
    console.error(
      `[${ticker}/${apiType}/advice] Failed to generate advice:`,
      e,
    );
    const errorAdvice: AdviceObject = {
      error: true,
      message: `Gemini 조언 생성 실패: ${
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
    signals: TradingSignal[];
  };

  try {
    body = await request.json();
  } catch (error) {
    // FIXED: Changed 'e' to 'error' and added a log
    console.error("[/api/advice] Failed to parse request body:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { ticker, apiType, signals } = body;
  const progressKey = `${apiType}-${ticker}`; // Composite key for the map

  if (!ticker || !apiType || !signals) {
    return NextResponse.json(
      { error: "Missing required fields: ticker, apiType, signals" },
      { status: 400 },
    );
  }

  const cachePath = getCachePath(apiType);
  const stockCache = await readStockCache(cachePath);
  const cachedTickerData = stockCache[ticker];

  // 1. Check for valid data cache (signals should match)
  // This ensures the advice is for the most recent data
  if (
    !cachedTickerData ||
    !cachedTickerData.data ||
    !cachedTickerData.signals
  ) {
    // This case shouldn't happen if the frontend fetches data first, but as a safeguard.
    // We can proceed to generate advice using signals from the POST body.
    console.warn(
      `[${ticker}/${apiType}/advice] Cache miss on data/signals, proceeding with signals from POST body.`,
    );
    // Ensure cache entry exists to write advice to
    if (!stockCache[ticker]) {
      stockCache[ticker] = {
        lastFetch: new Date().toISOString().split("T")[0], // Mark as "fetched"
        data: [], // Data is unknown here, but that's okay for advice gen
        signals: signals,
      };
    }
  }

  // 2. Check for valid advice cache
  if (cachedTickerData?.advice && cachedTickerData.advice.error === false) {
    console.log(
      `✅ [${ticker}/${apiType}/advice] ADVICE CACHE HIT: Returning cached advice.`,
    );
    return NextResponse.json(cachedTickerData.advice);
  }

  // 3. Check if generation is already in progress
  if (adviceGenerationInProgress.has(progressKey)) {
    console.log(
      `[${ticker}/${apiType}/advice] Advice generation in progress. Awaiting existing promise.`,
    );
    // Await the existing promise
    const advice = await adviceGenerationInProgress.get(progressKey)!;
    return NextResponse.json(advice, {
      status: advice.error ? 500 : 200,
    });
  }

  // 4. Generate new advice (if missing or error)
  const generationPromise = generateAndCacheAdvice(
    apiType,
    ticker,
    signals,
    stockCache,
    stockCache[ticker], // Pass the specific cache entry
  );
  adviceGenerationInProgress.set(progressKey, generationPromise);

  let advice: AdviceObject;
  try {
    // Await its completion
    advice = await generationPromise;
  } finally {
    // Remove from map once complete (success or fail)
    adviceGenerationInProgress.delete(progressKey);
    console.log(
      `[${ticker}/${apiType}/advice] Generation finished. Promise removed from map.`,
    );
  }

  return NextResponse.json(advice, {
    status: advice.error ? 500 : 200,
  });
}
