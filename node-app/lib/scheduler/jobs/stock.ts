/* lib/scheduler/jobs/stock.ts */

import axios, { AxiosError } from "axios";
import { schedulerConfig } from "../config";
// [FIXED] Updated import to use the new separated long-term service
import { TelegramLongTermService } from "../telegramLongTermService";
import { StockSignalInfo } from "../types";
import { TradingSignal } from "../../stockUtils";
import stockConfig from "../../stock.json";

/**
 * Sends daily stock signals report based on 1d timeframe data.
 * @param telegramService Instance of TelegramLongTermService
 */
export async function sendDailyStockSignals(
  telegramService: TelegramLongTermService,
): Promise<void> {
  const usStocks = stockConfig.us_stocks;
  const allLatestSignals: StockSignalInfo[] = [];

  for (const stock of usStocks) {
    try {
      // Fetching data from the local internal API (defaulting to 1d timeframe)
      const response = await axios.get(
        `${schedulerConfig.apiBaseUrl}/api/kisStock/${stock.ticker}?timeframe=1d`,
      );

      // Extracting signals and Gemini advice from the response
      const { signals, advice } = response.data;

      if (signals?.length > 0) {
        const currentSignal: TradingSignal = signals.at(-1)!;
        const lastMeaningfulSignal = signals
          .filter((s: TradingSignal) => s.type !== "hold")
          .at(-1);

        // Skip if there is no meaningful signal history
        if (currentSignal.type === "hold" && !lastMeaningfulSignal) {
          continue;
        }

        // Skip notification if the stock is in a neutral phase
        if (
          currentSignal.type === "hold" &&
          lastMeaningfulSignal?.type === "sell"
        ) {
          console.log(
            `[${stock.ticker}] Skipping notification: Neutral phase (last signal: sell)`,
          );
          continue;
        }

        // Add to the list including the AI advice object
        allLatestSignals.push({
          name: stock.ticker,
          currentSignal: currentSignal,
          lastMeaningfulSignal: lastMeaningfulSignal,
          advice: advice,
        });
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(
        `Error checking status for ${stock.ticker} (KIS):`,
        axiosError.response?.data || axiosError.message,
      );
    }
  }

  // Dispatch notifications if there are any valid signals to report
  if (allLatestSignals.length > 0) {
    console.log(
      `Checked ${allLatestSignals.length} KIS US stock statuses. Sending report via Telegram Long-Term Chat.`,
    );

    // Send portfolio status (summary + chunked detail) via the long-term service
    await telegramService.notifyPortfolioStatus(allLatestSignals);
  } else {
    console.log("No KIS US stocks found to notify or failed to fetch data.");
  }
}
