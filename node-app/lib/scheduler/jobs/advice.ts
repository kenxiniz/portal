import axios, { AxiosError } from "axios";
import path from "path";
import fs from "fs/promises";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

let isAdviceRunning = false;

export async function generateDailyAdvice(): Promise<void> {
  if (isAdviceRunning) {
    console.log("Advice generation is already running. Skipping trigger.");
    return;
  }

  isAdviceRunning = true;
  const usStocks = stockConfig.us_stocks;
  console.log(`Starting advice generation for ${usStocks.length} US stocks...`);

  try {
    for (const stock of usStocks) {
      try {
        console.log(`Triggering advice generation for ${stock.ticker}...`);
        const response = await axios.post(
          `${schedulerConfig.apiBaseUrl}/api/advice`,
          {
            ticker: stock.ticker,
            apiType: "kisStock",
          },
        );

        if (response.data && response.data.isCached) {
          console.log(
            `[${stock.ticker}] Cached advice found. Skipping 1-minute wait.`,
          );
          continue;
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          `Failed to generate advice for ${stock.ticker}:`,
          axiosError.response?.data || axiosError.message,
        );
      }

      console.log("Waiting 1 minute before next request...");
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
    console.log("Daily advice generation completed.");
  } finally {
    isAdviceRunning = false;
  }
}

export async function resetAdviceCache(): Promise<void> {
  const cachePath = path.join(schedulerConfig.cacheDir, "kis-stock-cache.json");
  try {
    console.log("Starting advice cache reset...");
    try {
      await fs.access(cachePath);
    } catch {
      console.log("Cache file not found. Nothing to reset.");
      return;
    }

    const fileContent = await fs.readFile(cachePath, "utf-8");
    const cacheData = JSON.parse(fileContent);

    let resetCount = 0;
    for (const key in cacheData) {
      if (cacheData[key].advice) {
        cacheData[key].advice = null;
        resetCount++;
      }
    }

    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), "utf-8");
    console.log(`Advice cache reset completed. Cleared ${resetCount} entries.`);
  } catch (error) {
    console.error("Failed to reset advice cache:", error);
  }
}
