/* /app/api/k-stock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
// Remove GoogleGenerativeAI imports if no longer needed here
// import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import {
  StockDataPoint,
  CachedStockData,
  AdviceObject, // Import AdviceObject type
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
} from "@/lib/stockUtils";
import { getDailyKoreanStockData } from "@/lib/koreanKisApi";
import stockConfig from "@/lib/stock.json";
// ✅ [추가] Import the function from the new file
import { getGeminiAdvice } from "@/lib/geminiUtils";

const cacheDir = path.join(process.cwd(), ".cache");
const stockCachePath = path.join(cacheDir, "korean-stock-cache.json");

interface StockCache {
  [key: string]: CachedStockData;
}

// --- Existing read/writeStockCache functions (Keep as is) ---
async function readStockCache(): Promise<StockCache> {
  try {
    const fileContent = await fs.readFile(stockCachePath, "utf-8");
    return JSON.parse(fileContent);
  } catch {
    return {};
  }
}
async function writeStockCache(data: StockCache): Promise<void> {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(stockCachePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing K-stock cache file:", error);
  }
}
// --- End of read/writeStockCache functions ---

// --- ❌ [삭제] getGeminiAdvice function is now moved to lib/geminiUtils.ts ---

// Helper to get stock name
function getStockName(ticker: string): string {
  const stockInfo = stockConfig.k_stocks.find((s) => s.ticker === ticker);
  return stockInfo ? stockInfo.name : ticker;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const ticker = pathParts[pathParts.length - 1];

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const stockCache = await readStockCache();
  const cachedTickerData = stockCache[ticker];
  const today = new Date().toISOString().split("T")[0];

  let rawData: StockDataPoint[];
  let adviceResult: AdviceObject | null = null;
  let isKisCacheMiss = false;
  let regenerateAdvice = false;

  console.log(`[${ticker}] Starting GET request handler (K-Stock).`);
  // 1. Load or Fetch KIS Data
  if (cachedTickerData && cachedTickerData.lastFetch === today) {
    console.log(
      `✅ [${ticker}] K-STOCK CACHE HIT: Loading raw data from cache file.`,
    );
    rawData = cachedTickerData.data;
    adviceResult = cachedTickerData.advice || null; // Load cached advice object (or null)
    console.log(`[${ticker}] Loaded from cache - Advice value:`, adviceResult); // Log the loaded value

    // --- ✅ [수정] Regeneration condition ---
    // Regenerate if advice is missing, is a string (old format), or is an error object
    if (
      !adviceResult ||
      typeof adviceResult === "string" ||
      adviceResult.error === true
    ) {
      if (!adviceResult) {
        console.log(
          `⚠️ [${ticker}] GEMINI CACHE INFO: Advice is missing from cache. Will generate.`,
        );
      } else if (typeof adviceResult === "string") {
        console.warn(
          `🔄 [${ticker}] GEMINI REGENERATION NEEDED: Cached advice is in old string format. Will regenerate.`,
        ); // New log for string format
      } else {
        // adviceResult.error === true
        console.warn(
          `🔄 [${ticker}] GEMINI REGENERATION NEEDED: Cached advice indicates a previous error. Will regenerate.`,
        );
      }
      regenerateAdvice = true; // Mark for regeneration in all these cases
    } else {
      // adviceResult exists and adviceResult.error is false
      console.log(
        `✅ [${ticker}] GEMINI CACHE HIT: Using valid cached advice object.`,
      );
      regenerateAdvice = false; // Do not regenerate
    }
    // --- ✅ [수정] End Regeneration condition ---
  } else {
    // KIS Cache Miss
    console.log(
      `❌ [${ticker}] K-STOCK CACHE MISS: Fetching new data from KIS API.`,
    );
    isKisCacheMiss = true;
    regenerateAdvice = true; // Always regenerate on KIS cache miss
    // ... (rest of the else block remains the same) ...
    try {
      console.log(`[${ticker}] Calling getDailyKoreanStockData...`);
      rawData = await getDailyKoreanStockData(ticker);
      console.log(`[${ticker}] getDailyKoreanStockData finished successfully.`);
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "An unknown error occurred";
      console.error(`[K-Stock API Route - ${ticker}] Failed to fetch data:`, e);
      return NextResponse.json(
        { error: `Failed to load data for ${ticker}. Error: ${errorMessage}` },
        { status: 500 },
      );
    }
  }

  // 2. Calculate Indicators and Signals
  console.log(`[${ticker}] Calculating indicators and signals...`);
  const dataWithIndicators = calculateBollingerBands(calculateRSI(rawData));
  const signals = analyzeAllTradingSignals(dataWithIndicators);
  const stockName = getStockName(ticker); // Get stock name
  console.log(`[${ticker}] Indicators and signals calculated.`);

  // 3. Generate or Regenerate Advice if needed
  console.log(
    `[${ticker}] Checking if advice regeneration is needed. regenerateAdvice = ${regenerateAdvice}`,
  );
  if (regenerateAdvice) {
    if (isKisCacheMiss) {
      console.log(
        `🤖 [${ticker}] GEMINI ADVICE: Generating new advice from Gemini due to KIS cache miss.`,
      );
    } else {
      console.log(
        `🤖 [${ticker}] GEMINI ADVICE: Regenerating advice from Gemini due to ${!adviceResult ? "missing advice" : "previous error"} in cache.`,
      );
    }
    // ✅ [수정] Call the imported function, passing 'kr' and stockName
    adviceResult = await getGeminiAdvice(signals, ticker, "kr", stockName);
    console.log(
      `[${ticker}] Gemini advice generation function returned:`,
      adviceResult,
    );

    // Update Cache
    if (adviceResult !== null) {
      console.log(
        `[${ticker}] Preparing to write cache with new adviceResult...`,
      );
      stockCache[ticker] = {
        lastFetch: today,
        data: rawData,
        advice: adviceResult,
      };
      await writeStockCache(stockCache);
      console.log(
        `💾 [${ticker}] CACHE WRITE: Saved ${isKisCacheMiss ? "new KIS data and" : "updated"} advice result.`,
      );
    } else {
      console.warn(
        `[${ticker}] Advice generation returned null unexpectedly. Not updating cache.`,
      );
    }
  } else {
    console.log(
      `[${ticker}] No regeneration needed. Using existing adviceResult from cache:`,
      adviceResult,
    );
  }

  // --- Response ---
  console.log(`[${ticker}] Sending API response with advice:`, adviceResult);
  return NextResponse.json({
    data: dataWithIndicators,
    signals: signals,
    advice: adviceResult,
  });
}
