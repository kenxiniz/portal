import axios, { AxiosError } from "axios";
import { schedulerConfig } from "../config";
import { KakaoNotificationService } from "../kakaoService";
import { StockSignalInfo } from "../types";
import { TradingSignal } from "../../stockUtils";
import stockConfig from "../../stock.json";

export async function sendDailyStockSignals(kakaoService: KakaoNotificationService): Promise<void> {
  const usStocks = stockConfig.us_stocks;
  const allLatestSignals: StockSignalInfo[] = [];

  for (const stock of usStocks) {
    try {
      const response = await axios.get(`${schedulerConfig.apiBaseUrl}/api/kisStock/${stock.ticker}`);
      const { signals }: { signals: TradingSignal[] } = response.data;
      
      if (signals?.length > 0) {
        const currentSignal = signals.at(-1)!;
        const lastMeaningfulSignal = signals.filter((s) => s.type !== "hold").at(-1);

        if (currentSignal.type === "hold" && !lastMeaningfulSignal) {
          continue;
        }

        if (currentSignal.type === "hold" && lastMeaningfulSignal?.type === "sell") {
          console.log(`[${stock.ticker}] Skipping notification: Neutral phase (last signal: sell)`);
          continue;
        }

        allLatestSignals.push({
          name: stock.ticker,
          currentSignal: currentSignal,
          lastMeaningfulSignal: lastMeaningfulSignal,
        });
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(`Error checking status for ${stock.ticker} (KIS):`, axiosError.response?.data || axiosError.message);
    }
  }

  if (allLatestSignals.length > 0) {
    console.log(`Checked ${allLatestSignals.length} KIS US stock statuses and sending notifications.`);
    await kakaoService.notifyInChunks(
      kakaoService.createStockStatusTemplate,
      allLatestSignals,
      schedulerConfig.notificationChunkSize,
    );
  } else {
    console.log("No KIS US stocks to notify or failed to fetch data.");
  }
}
