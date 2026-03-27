/* lib/scheduler/jobs/advice.ts */

import axios, { AxiosError } from "axios";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

let isAdviceRunning = false;

/**
 * Triggers the API to generate daily AI advice using the new batch processing method.
 * Forces fresh generation by passing the refresh flag.
 */
export async function generateDailyAdvice(): Promise<void> {
  if (isAdviceRunning) {
    console.log("[AdviceJob] Generation is already in progress. Skipping.");
    return;
  }

  isAdviceRunning = true;
  const usStocksCount = stockConfig.us_stocks.length;
  const krStocksCount = stockConfig.k_stocks.length;

  try {
    // 1. Process US Market Batch
    console.log(
      `[AdviceJob] Triggering FORCED BATCH analysis for ${usStocksCount} US stocks...`,
    );
    try {
      await axios.post(`${schedulerConfig.apiBaseUrl}/api/advice`, {
        isBatch: true,
        apiType: "kisStock",
        refresh: true, // Force fresh generation by bypassing memory cache
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

    // Wait 60 seconds between market batches to ensure safe Gemini API rate limits
    console.log(
      "[AdviceJob] Waiting 60 seconds before processing KR market...",
    );
    await new Promise((resolve) => setTimeout(resolve, 60000));

    // 2. Process KR Market Batch
    console.log(
      `[AdviceJob] Triggering FORCED BATCH analysis for ${krStocksCount} KR stocks...`,
    );
    try {
      await axios.post(`${schedulerConfig.apiBaseUrl}/api/advice`, {
        isBatch: true,
        apiType: "kStock",
        refresh: true,
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

    console.log(
      "[AdviceJob] Daily advice batch generation sequence completed.",
    );
  } finally {
    isAdviceRunning = false;
  }
}

/**
 * Resets the advice cache in MongoDB by setting advice fields to null.
 * This ensures fresh advice is generated during the next cycle.
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
