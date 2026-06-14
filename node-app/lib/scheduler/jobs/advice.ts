/* lib/scheduler/jobs/advice.ts */

import axios, { AxiosError } from "axios";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

let isAdviceRunning = false;

// 💡 헷갈림 방지: 시세 캐시가 아니라 '오늘 조언 생성이 끝난 종목'을 기록하는 출석부(Set)입니다.
const processedTickersTracker = new Set<string>();
let lastAdviceDate = "";

/**
 * Filter tickers that already have valid advice for today from Tracker or DB.
 * @param tickers List of ticker strings to check
 * @param market 'us_stocks' or 'k_stocks'
 */
async function getTickersRequiringUpdate(
  tickers: string[],
  market: string,
): Promise<string[]> {
  const todayStr = new Date().toISOString().split("T")[0];

  // 날짜가 바뀌면 어제 기록된 출석부를 비워야 오늘치 조언을 새로 생성할 수 있습니다.
  if (lastAdviceDate !== todayStr) {
    console.log(
      `[AdviceJob] Date changed from ${lastAdviceDate} to ${todayStr}. Resetting daily ticker tracker.`,
    );
    processedTickersTracker.clear();
    lastAdviceDate = todayStr;
  }

  // 1. Check Tracker (Memory Set)
  const missingInTracker = tickers.filter(
    (ticker) => !processedTickersTracker.has(`${market}:${ticker}`),
  );
  if (missingInTracker.length === 0) return [];

  // 2. Check Database
  try {
    await connectDB();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingDocs = await TickerAdvice.find({
      ticker: { $in: missingInTracker },
      updatedAt: { $gte: today },
      advice: { $ne: null },
    }).select("ticker");

    const existingTickersInDb = new Set(existingDocs.map((doc) => doc.ticker));

    // Update tracker with DB hits
    existingTickersInDb.forEach((ticker) => {
      processedTickersTracker.add(`${market}:${ticker}`);
    });

    // 3. Return only tickers missing in both Tracker and DB
    return missingInTracker.filter(
      (ticker) => !existingTickersInDb.has(ticker),
    );
  } catch (error) {
    console.error("[AdviceJob] Failed to check DB for existing advice:", error);
    return missingInTracker; // Fallback to processing all missing in tracker
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
    const usTickersToProcess = await getTickersRequiringUpdate(
      stockConfig.us_stocks.map((s: { ticker: string }) => s.ticker),
      "us_stocks",
    );

    if (usTickersToProcess.length > 0) {
      console.log(
        `[AdviceJob] Triggering analysis for ${usTickersToProcess.length} US stocks (Tracker MISS)...`,
      );
      try {
        await axios.post(`${schedulerConfig.apiBaseUrl}/api/advice`, {
          isBatch: true,
          apiType: "kisStock",
          tickers: usTickersToProcess,
          refresh: false,
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
    const krTickersToProcess = await getTickersRequiringUpdate(
      stockConfig.k_stocks.map((s: { ticker: string }) => s.ticker),
      "k_stocks",
    );

    if (krTickersToProcess.length > 0) {
      console.log(
        `[AdviceJob] Triggering analysis for ${krTickersToProcess.length} KR stocks (Tracker MISS)...`,
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

    // Tracker 초기화
    processedTickersTracker.clear();
    lastAdviceDate = "";

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
