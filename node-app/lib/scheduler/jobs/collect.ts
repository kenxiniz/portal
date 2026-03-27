/* lib/scheduler/jobs/collect.ts */

import axios, { AxiosError } from "axios";
import { isMarketOpen } from "../../marketTime";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

// Import the newly separated telegram services
import { TelegramLongTermService } from "../telegramLongTermService";
import { TelegramShortTermService } from "../telegramShortTermService";

/**
 * Periodically collects market data every 5 minutes during market hours.
 * It triggers the internal API with 'refresh=true' to force update MongoDB.
 */
export async function collectMarketData(): Promise<void> {
  const isUsOpen = isMarketOpen("US");
  const isKrOpen = isMarketOpen("KR");

  if (!isUsOpen && !isKrOpen) {
    console.log(
      "[INFO] [Scheduler] All markets are closed. Skipping 5-min collection.",
    );
    return;
  }

  console.log(
    "[INFO] [Scheduler] Market is open. Starting 5-min data update cycle.",
  );

  // Initialize telegram services
  const telegramLongTermService = new TelegramLongTermService();
  const telegramShortTermService = new TelegramShortTermService();

  // Process US Stocks
  if (isUsOpen) {
    for (const stock of stockConfig.us_stocks) {
      // 1d is mainly for long-term, but included for daily sync
      // 1h and 15m are critical for short-term trading signals
      const timeframes = ["1d", "1h", "15m"];

      for (const timeframe of timeframes) {
        try {
          const url = `${schedulerConfig.apiBaseUrl}/api/kisStock/${stock.ticker}?timeframe=${timeframe}&refresh=true`;
          const response = await axios.get(url);

          if (
            response.data &&
            response.data.signals &&
            response.data.signals.length > 0
          ) {
            const signals = response.data.signals;
            const latestSignal = signals[signals.length - 1];

            // [DEBUG] Log any non-hold signals to identify why buy signals might be missing
            if (latestSignal.type !== "hold") {
              console.log(
                `[SIGNAL DETECTED] Ticker: ${stock.ticker}, Timeframe: ${timeframe}, Type: ${latestSignal.type}, Reason: ${latestSignal.reason}`,
              );
            }

            if (timeframe === "1d") {
              // Dispatch to long-term service (Daily report style)
              await telegramLongTermService.notifyRealtimeSignal(
                stock.ticker,
                timeframe,
                signals,
              );
            } else {
              // Dispatch to short-term service (Real-time alert style for 1h, 15m)
              // This service handles "buy", "inverse-buy", and "sell"
              await telegramShortTermService.notifyRealtimeSignal(
                stock.ticker,
                timeframe,
                signals,
              );
            }
          }
        } catch (error) {
          const axiosError = error as AxiosError;
          console.error(
            `[ERROR] [Scheduler] Failed to refresh ${stock.ticker} (${timeframe}):`,
            axiosError.message,
          );
        }

        // Rate limit protection to prevent API hammering (500ms)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // Process KR Stocks
  if (isKrOpen) {
    // KR Market logic can be implemented here following the same pattern
    console.log("[INFO] [Scheduler] KR Market logic processing placeholder.");
  }

  console.log(
    "[INFO] [Scheduler] 5-min market data collection cycle completed.",
  );
}
