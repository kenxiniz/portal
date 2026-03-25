/* lib/scheduler/jobs/collect.ts */
import axios, { AxiosError } from "axios";
import { isMarketOpen } from "../../marketTime";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";
import { TelegramNotificationService } from "../telegramService";

/**
 * Periodically collects market data every 5 minutes during market hours.
 * It triggers the internal API with 'refresh=true' to force update MongoDB.
 */
export async function collectMarketData(): Promise<void> {
  const isUsOpen = isMarketOpen("US");
  const isKrOpen = isMarketOpen("KR");

  if (!isUsOpen && !isKrOpen) {
    console.log(
      "[Scheduler] All markets are closed. Skipping 5-min collection.",
    );
    return;
  }

  console.log("[Scheduler] Market is open. Starting 5-min data update.");

  const telegramService = new TelegramNotificationService();

  // Process US Stocks
  if (isUsOpen) {
    for (const stock of stockConfig.us_stocks) {
      const timeframes = ["1d", "1h", "15m"];

      for (const timeframe of timeframes) {
        try {
          const url = `${schedulerConfig.apiBaseUrl}/api/kisStock/${stock.ticker}?timeframe=${timeframe}&refresh=true`;
          const response = await axios.get(url);
          console.log(
            `[Scheduler] Successfully triggered refresh for ${stock.ticker} (${timeframe})`,
          );

          // Evaluate real-time signals for intraday timeframes
          if (timeframe !== "1d" && response.data && response.data.signals) {
            // [MODIFIED] Call the updated generic signal notification method
            await telegramService.notifyRealtimeSignal(
              stock.ticker,
              timeframe,
              response.data.signals,
            );
          }
        } catch (error) {
          const axiosError = error as AxiosError;
          console.error(
            `[Scheduler] Failed to refresh ${stock.ticker} (${timeframe}):`,
            axiosError.message,
          );
        }

        // Rate limit protection (500ms)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // Process KR Stocks (Logic placeholder)
  if (isKrOpen) {
    console.log("[Scheduler] KR Market collection logic can be added here.");
  }

  console.log("[Scheduler] 5-min market data collection cycle completed.");
}
