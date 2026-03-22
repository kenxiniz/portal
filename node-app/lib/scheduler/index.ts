import cron from "node-cron";
import { schedulerConfig } from "./config";
import { TelegramNotificationService } from "./telegramService";
import { generateDailyAdvice, resetAdviceCache } from "./jobs/advice";
import { updateLottoWinningNumbers, sendDailyLottoNumbers } from "./jobs/lotto";
import { sendDailyStockSignals } from "./jobs/stock";

class JobScheduler {
  private telegramService: TelegramNotificationService;

  constructor() {
    this.telegramService = new TelegramNotificationService();
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
