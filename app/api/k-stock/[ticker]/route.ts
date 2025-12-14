/* /app/api/k-stock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import {
  StockDataPoint,
  CachedStockData,
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
} from "@/lib/stockUtils";
import { getDailyKoreanStockData } from "@/lib/koreanKisApi";

const cacheDir = path.join(process.cwd(), ".cache");
const stockCachePath = path.join(cacheDir, "korean-stock-cache.json");

interface StockCache {
  [key: string]: CachedStockData;
}

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
  let signals;
  // [MODIFIED] advice 변수 추가
  const advice = cachedTickerData?.advice || null;

  console.log(`[${ticker}] Starting GET request handler (K-Stock).`);

  if (cachedTickerData && cachedTickerData.lastFetch === today) {
    console.log(
      `✅ [${ticker}] K-STOCK CACHE HIT: Loading raw data and signals from cache file.`,
    );
    rawData = cachedTickerData.data;
    signals =
      cachedTickerData.signals ||
      analyzeAllTradingSignals(calculateBollingerBands(calculateRSI(rawData)));
  } else {
    console.log(
      `❌ [${ticker}] K-STOCK CACHE MISS: Fetching new data from KIS API.`,
    );
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

    console.log(`[${ticker}] Calculating indicators and signals...`);
    rawData = calculateBollingerBands(calculateRSI(rawData));
    signals = analyzeAllTradingSignals(rawData);
    console.log(`[${ticker}] Indicators and signals calculated.`);

    stockCache[ticker] = {
      lastFetch: today,
      data: rawData,
      signals: signals,
      advice: advice, // Preserve old advice
    };
    await writeStockCache(stockCache);
    console.log(
      `💾 [${ticker}] CACHE WRITE: Saved new K-Stock data and signals.`,
    );
  }

  console.log(`[${ticker}] Sending API response (including advice).`);
  // [MODIFIED] Return advice
  return NextResponse.json({
    data: rawData,
    signals: signals,
    advice: advice,
  });
}
