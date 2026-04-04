/* lib/scheduler/jobs/advice.ts */

import axios, { AxiosError } from "axios";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

let isAdviceRunning = false;

// In-memory cache to store tickers that are already processed today
const memoryCache = new Set<string>();
let lastCacheUpdateDate = "";

/**
 * Filter tickers that already have valid advice for today from Memory or DB.
 * @param tickers List of ticker strings to check
 * @param market 'us_stocks' or 'k_stocks'
 */
async function getTickersRequiringUpdate(
  tickers: string[],
  market: string,
): Promise<string[]> {
  const todayStr = new Date().toISOString().split("T")[0];

  // Reset memory cache if the day has changed
  if (lastCacheUpdateDate !== todayStr) {
    console.log(
      `[AdviceJob] Date changed from ${lastCacheUpdateDate} to ${todayStr}. Clearing memory cache.`,
    );
    memoryCache.clear();
    lastCacheUpdateDate = todayStr;
  }

  // 1. Check Memory Cache
  const missingInMem = tickers.filter(
    (ticker) => !memoryCache.has(`${market}:${ticker}`),
  );
  if (missingInMem.length === 0) return [];

  // 2. Check Database
  try {
    await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingDocs = await TickerAdvice.find({
      ticker: { $in: missingInMem },
      updatedAt: { $gte: today },
      advice: { $ne: null },
    }).select("ticker");

    const existingTickersInDb = new Set(existingDocs.map((doc) => doc.ticker));

    // Update memory cache with DB hits
    existingTickersInDb.forEach((ticker) => {
      memoryCache.add(`${market}:${ticker}`);
    });

    // 3. Return only tickers missing in both Memory and DB
    return missingInMem.filter((ticker) => !existingTickersInDb.has(ticker));
  } catch (error) {
    console.error("[AdviceJob] Failed to check DB for existing advice:", error);
    return missingInMem; // Fallback to processing all missing in memory
  }
}

/**
 * Triggers the API to generate daily AI advice only for missing items.
 */
export async function generateDailyAdvice(): Promise<void> {
  if (isAdviceRunning) {
    console.log("[AdviceJob] Generation is already in progress. Skipping.");
    return;
  }

  isAdviceRunning = true;

  try {
    // 1. Process US Market
    // Convert object array to string array using .map() to fix Type Error
    const usTickersToProcess = await getTickersRequiringUpdate(
      stockConfig.us_stocks.map((s: { ticker: string }) => s.ticker),
      "us_stocks",
    );

    if (usTickersToProcess.length > 0) {
      console.log(
        `[AdviceJob] Triggering analysis for ${usTickersToProcess.length} US stocks (Cache MISS)...`,
      );
      try {
        await axios.post(`${schedulerConfig.apiBaseUrl}/api/advice`, {
          isBatch: true,
          apiType: "kisStock",
          tickers: usTickersToProcess, // Send only filtered tickers
          refresh: false, // Do not force, use cache-first logic in API handler
        });
        console.log(
          "[AdviceJob] US market batch generation completed successfully.",
        );
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          "[AdviceJob] Failed to generate batch advice for US market:",
          axiosError.response?.data || axiosError.message,
        );
      }
    } else {
      console.log(
        "[AdviceJob] All US stocks are up to date. Skipping API call.",
      );
    }

    // Wait 60 seconds between market batches to avoid rate limits
    console.log(
      "[AdviceJob] Waiting 60 seconds before processing KR market...",
    );
    await new Promise((resolve) => setTimeout(resolve, 60000));

    // 2. Process KR Market
    // Convert object array to string array using .map() to fix Type Error
    const krTickersToProcess = await getTickersRequiringUpdate(
      stockConfig.k_stocks.map((s: { ticker: string }) => s.ticker),
      "k_stocks",
    );

    if (krTickersToProcess.length > 0) {
      console.log(
        `[AdviceJob] Triggering analysis for ${krTickersToProcess.length} KR stocks (Cache MISS)...`,
      );
      try {
        await axios.post(`${schedulerConfig.apiBaseUrl}/api/advice`, {
          isBatch: true,
          apiType: "kStock",
          tickers: krTickersToProcess,
          refresh: false,
        });
        console.log(
          "[AdviceJob] KR market batch generation completed successfully.",
        );
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          "[AdviceJob] Failed to generate batch advice for KR market:",
          axiosError.response?.data || axiosError.message,
        );
      }
    } else {
      console.log(
        "[AdviceJob] All KR stocks are up to date. Skipping API call.",
      );
    }

    console.log(
      "[AdviceJob] Daily advice batch generation sequence completed.",
    );
  } finally {
    isAdviceRunning = false;
  }
}

/**
 * Resets the advice cache in both DB and memory.
 */
export async function resetAdviceCache(): Promise<void> {
  try {
    console.log("[CacheReset] Connecting to MongoDB for cache maintenance...");
    await connectDB();

    console.log("[CacheReset] Starting mass reset of ticker advice entries...");

    const result = await TickerAdvice.updateMany(
      {},
      {
        $set: { advice: null },
        $currentDate: { updatedAt: true },
      },
    );

    // Also clear in-memory cache
    memoryCache.clear();
    lastCacheUpdateDate = "";

    console.log(
      `[CacheReset] MongoDB update finished. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
    );

    console.log("[CacheReset] Advice cache reset completed successfully.");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "[CacheReset] Critical failure during MongoDB cache reset:",
      errorMessage,
    );
  }
}
