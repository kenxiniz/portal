/* lib/scheduler/index.ts */
import cron from "node-cron";
import { schedulerConfig } from "./config";
// [FIXED] Updated import to use the new separated long-term service
import { TelegramLongTermService } from "./telegramLongTermService";
import { generateDailyAdvice, resetAdviceCache } from "./jobs/advice";
import { updateLottoWinningNumbers, sendDailyLottoNumbers } from "./jobs/lotto";
import { sendDailyStockSignals } from "./jobs/stock";
import { collectMarketData } from "./jobs/collect";
import { checkAllRegionsEC2Instances } from "./jobs/aws";

export { generateDailyAdvice, resetAdviceCache, collectMarketData };

class JobScheduler {
  // [FIXED] Change type to TelegramLongTermService
  private telegramService: TelegramLongTermService;

  constructor() {
    // [FIXED] Instantiate the new long-term service
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
      schedulerConfig.cronSchedules.collectMarketData || "*/5 * * * *",
      collectMarketData,
    );
    this._scheduleJob(
      "Check AWS EC2 Instances",
      schedulerConfig.cronSchedules.awsSecurity || "0 7,19 * * *",
      checkAllRegionsEC2Instances,
    );
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

if (!global.isSchedulerRunning) {
  console.log(
    `Initializing scheduler... (NODE_ENV: ${process.env.NODE_ENV || "unknown"})`,
  );
  new JobScheduler();
  global.isSchedulerRunning = true;
} else {
  console.log("Scheduler is already running.");
}
