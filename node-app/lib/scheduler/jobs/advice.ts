/* lib/scheduler/jobs/advice.ts */

import axios, { AxiosError } from "axios";
import { connectDB } from "@/lib/mongodb";
import { TickerAdvice } from "@/lib/models/advice";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

let isAdviceRunning = false;

/**
 * Triggers the API to generate daily AI advice for all monitored stocks.
 * Now forces fresh generation by passing the refresh flag.
 */
export async function generateDailyAdvice(): Promise<void> {
  if (isAdviceRunning) {
    console.log("[AdviceJob] Generation is already in progress. Skipping.");
    return;
  }

  isAdviceRunning = true;
  const usStocks = stockConfig.us_stocks;
  console.log(
    `[AdviceJob] Starting generation for ${usStocks.length} US stocks.`,
  );

  try {
    for (const stock of usStocks) {
      try {
        console.log(
          `[AdviceJob] Triggering FORCED analysis for ${stock.ticker}...`,
        );

        const response = await axios.post(
          `${schedulerConfig.apiBaseUrl}/api/advice`,
          {
            ticker: stock.ticker,
            apiType: "kisStock",
            refresh: true, // [NEW] Force fresh generation by bypassing memory cache
          },
        );

        if (response.data && response.data.isCached) {
          console.log(
            `[AdviceJob] ${stock.ticker}: Existing valid advice found in cache. (Unexpected for refresh)`,
          );
          continue;
        }

        console.log(
          `[AdviceJob] ${stock.ticker}: New advice generated successfully.`,
        );
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          `[AdviceJob] Failed to generate advice for ${stock.ticker}:`,
          axiosError.response?.data || axiosError.message,
        );
      }

      // Wait 1 minute between requests to avoid Gemini API rate limits
      console.log("[AdviceJob] Waiting 60 seconds before next request...");
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
    console.log("[AdviceJob] Daily advice generation sequence completed.");
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
