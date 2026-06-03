/* lib/scheduler/index.ts */
import cron from "node-cron";
import { schedulerConfig } from "./config";
import { TelegramLongTermService } from "./telegramLongTermService";
import { generateDailyAdvice, resetAdviceCache } from "./jobs/advice";
import { updateLottoWinningNumbers, sendDailyLottoNumbers } from "./jobs/lotto";
import { sendDailyStockSignals } from "./jobs/stock";
import { collectMarketData } from "./jobs/collect";

// Import modules required for the initial cache warm-up sequence
import { connectDB } from "../mongodb";
import { getCandles } from "../candle/service";
import { setCacheData } from "../cache";
import stockConfig from "../stock.json";
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
} from "../stockUtils";
import { TickerAdvice } from "../models/advice";

export { generateDailyAdvice, resetAdviceCache, collectMarketData };

/**
 * Executes a sequential hydration of the shared memory cache from MongoDB.
 * Processes one ticker at a time to prevent OOM (Out of Memory) on 1GB RAM limits.
 */
async function warmUpCache(): Promise<void> {
  console.log("[Warm-up] Starting memory cache hydration from MongoDB...");
  try {
    await connectDB();
    const timeframes = ["1d", "1h", "15m"];

    const processAndCache = async (
      region: "US" | "KR",
      ticker: string,
      isInverse: boolean,
    ) => {
      for (const timeframe of timeframes) {
        const cacheKey =
          region === "US"
            ? `kisStock:${ticker}:${timeframe}`
            : `kStock:${ticker}:${timeframe}`;

        const rawDbData = await getCandles(
          region,
          ticker,
          timeframe,
          500,
          false,
        );

        if (rawDbData && rawDbData.length > 0) {
          const mappedData = rawDbData
            .map((c) => ({
              date:
                timeframe === "1d"
                  ? new Date(c.timestamp).toISOString().split("T")[0]
                  : new Date(c.timestamp)
                      .toISOString()
                      .replace("Z", "")
                      .replace("T", " "),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }))
            .sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            );

          const processedData = calculateBollingerBands(
            calculateRSI(mappedData),
          );
          const signals = analyzeAllTradingSignals(
            processedData,
            timeframe as "1d" | "1h" | "15m",
            isInverse,
          );

          const adviceDoc = (await TickerAdvice.findOne({
            ticker,
          }).lean()) as { advice?: object } | null;
          const latestAdvice = adviceDoc?.advice || null;

          setCacheData(cacheKey, {
            data: processedData,
            signals,
            advice: latestAdvice,
          });
        }
      }
    };

    // Sequentially process US stocks
    for (const stock of stockConfig.us_stocks) {
      await processAndCache("US", stock.ticker, !!stock.isInverse);
    }

    // Sequentially process KR stocks
    for (const stock of stockConfig.k_stocks) {
      await processAndCache("KR", stock.ticker, !!stock.isInverse);
    }

    console.log("[Warm-up] Memory cache hydration completed successfully.");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Warm-up] Critical failure during cache hydration:", msg);
  }
}

class JobScheduler {
  private telegramService: TelegramLongTermService;

  constructor() {
    this.telegramService = new TelegramLongTermService();
    this.initializeJobs();
  }

  private initializeJobs(): void {
    this._scheduleJob(
      "Update Lotto Winning Numbers",
      schedulerConfig.cronSchedules.updateLottoWins,
      updateLottoWinningNumbers,
    );
    this._scheduleJob(
      "Send Daily Lotto Numbers",
      schedulerConfig.cronSchedules.sendDailyLotto,
      () => sendDailyLottoNumbers(this.telegramService),
    );
    this._scheduleJob(
      "Send Daily Stock Signals",
      schedulerConfig.cronSchedules.sendDailyStockSignals,
      () => sendDailyStockSignals(this.telegramService),
    );
    this._scheduleJob(
      "Generate Daily Advice",
      schedulerConfig.cronSchedules.generateAdvice,
      generateDailyAdvice,
    );
    this._scheduleJob(
      "Reset Advice Cache on Weekdays",
      schedulerConfig.cronSchedules.resetAdvice,
      resetAdviceCache,
    );
    this._scheduleJob(
      "Collect Market Data Every 5 Minutes",
      schedulerConfig.cronSchedules.collectMarketData || "*/10 * * * *",
      collectMarketData,
    );
    /*
    this._scheduleJob(
      "Check AWS EC2 Instances",
      schedulerConfig.cronSchedules.awsSecurity || "0 7,19 * * *",
      checkAllRegionsEC2Instances,
    );
    */
  }

  private _scheduleJob(
    name: string,
    schedule: string,
    task: () => Promise<void>,
  ): void {
    cron.schedule(
      schedule,
      async () => {
        console.log(`Starting job [${name}]... (Schedule: ${schedule})`);
        try {
          await task();
          console.log(`Job [${name}] completed successfully.`);
        } catch (error) {
          console.error(`Error occurred during job [${name}]:`, error);
        }
      },
      { timezone: "Asia/Seoul" },
    );
  }
}

declare global {
  var isSchedulerRunning: boolean | undefined;
}

// Block scheduler initialization during the build process to prevent hanging
if (process.env.IS_BUILD === "true") {
  console.log(
    "[Scheduler] Build phase detected. Skipping scheduler initialization.",
  );
} else {
  if (!global.isSchedulerRunning) {
    console.log(
      `Initializing scheduler... (NODE_ENV: ${process.env.NODE_ENV || "unknown"})`,
    );

    // Trigger the background warm-up routine asynchronously
    warmUpCache();

    new JobScheduler();
    global.isSchedulerRunning = true;
  } else {
    console.log("Scheduler is already running.");
  }
}
