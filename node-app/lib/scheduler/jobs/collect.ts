/* lib/scheduler/jobs/collect.ts */

import axios, { AxiosError } from "axios";
import { isMarketOpen } from "../../marketTime";
import { schedulerConfig } from "../config";
import stockConfig from "../../stock.json";

// Import the global memory cache helper
import { setCacheData } from "../../cache";

// Import the newly separated telegram services
import { TelegramLongTermService } from "../telegramLongTermService";
import { TelegramShortTermService } from "../telegramShortTermService";

// Import the pure indicator logic and PivotLevels interface for real-time pivot scanning
import { calculatePivotPoints, PivotLevels } from "../../charts/indicators";

/**
 * Periodically collects market data every 5 minutes during market hours.
 * It triggers the internal API with 'refresh=true' to force update MongoDB
 * and subsequently serializes the fresh response directly into the shared memory cache.
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

      // 💡 1일봉(1d)에서 계산된 정확한 피봇 값을 저장하여 하위 분봉에서 공유합니다.
      let dailyPivot: PivotLevels | null = null;

      for (const timeframe of timeframes) {
        try {
          const url = `${schedulerConfig.apiBaseUrl}/api/kisStock/${stock.ticker}?timeframe=${timeframe}&refresh=true`;
          const response = await axios.get(url);

          if (response.data) {
            // 🚨 [ADDED] Hydrate the shared memory cache immediately upon a successful scheduler fetch.
            // This architecture guarantees that the UI queries will read straight from RAM.
            const cacheKey = `kisStock:${stock.ticker}:${timeframe}`;
            await setCacheData(cacheKey, response.data);

            // 💡 1일봉일 때, 완전한 세션 단위의 정확한 피봇 값을 미리 계산해둡니다.
            if (
              timeframe === "1d" &&
              response.data.data &&
              response.data.data.length > 0
            ) {
              const candles = response.data.data;
              const pivots = calculatePivotPoints(candles);
              dailyPivot = pivots[pivots.length - 1];
            }

            if (response.data.signals && response.data.signals.length > 0) {
              const signals = response.data.signals;
              const latestSignal = signals[signals.length - 1];

              // Log any non-hold signals to identify why buy signals might be missing
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

              // 60-min timeframe pivot levels breakthrough check
              if (
                timeframe === "1h" &&
                response.data.data &&
                response.data.data.length > 0
              ) {
                const candles = response.data.data;
                const lastIdx = candles.length - 1;
                const lastCandle = candles[lastIdx];

                // 💡 1시간봉 기준 피봇(리페인팅/자정 분할 오류 유발) 대신,
                // 미리 구해둔 정확한 1일봉 피봇(dailyPivot)을 사용하여 검증합니다.
                if (
                  dailyPivot &&
                  dailyPivot.p !== null &&
                  dailyPivot.r2 !== null &&
                  dailyPivot.s2 !== null
                ) {
                  const currentPrice = lastCandle.close;

                  if (currentPrice >= dailyPivot.r2) {
                    console.log(
                      `[PIVOT BREACH] Ticker: ${stock.ticker}, Price: ${currentPrice} >= R2: ${dailyPivot.r2}`,
                    );
                    await telegramLongTermService.notifyPivotBreach(
                      stock.ticker,
                      currentPrice,
                      dailyPivot.r2,
                      "R2_UP",
                      lastCandle.date,
                    );
                  } else if (currentPrice <= dailyPivot.s2) {
                    console.log(
                      `[PIVOT BREACH] Ticker: ${stock.ticker}, Price: ${currentPrice} <= S2: ${dailyPivot.s2}`,
                    );
                    await telegramLongTermService.notifyPivotBreach(
                      stock.ticker,
                      currentPrice,
                      dailyPivot.s2,
                      "S2_DOWN",
                      lastCandle.date,
                    );
                  }
                }
              }
            }
          }
        } catch (error) {
          const axiosError = error as AxiosError;
          console.error(
            `[ERROR] [Scheduler] Failed to refresh ${stock.ticker} (${timeframe}):`,
            axiosError.message,
          );
        }

        // Rate limit protection to prevent API hammering(500ms)
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // Process KR Stocks
  if (isKrOpen) {
    for (const stock of stockConfig.k_stocks) {
      const timeframes = ["1d", "1h", "15m"];

      for (const timeframe of timeframes) {
        try {
          const url = `${schedulerConfig.apiBaseUrl}/api/kStock/${stock.ticker}?timeframe=${timeframe}&refresh=true`;
          const response = await axios.get(url);

          if (response.data) {
            // Hydrate the Korean stock shared memory cache
            const cacheKey = `kStock:${stock.ticker}:${timeframe}`;
            await setCacheData(cacheKey, response.data);
          }
        } catch (error) {
          const axiosError = error as AxiosError;
          console.error(
            `[ERROR] [Scheduler] Failed to refresh KR ${stock.ticker} (${timeframe}):`,
            axiosError.message,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  console.log(
    "[INFO] [Scheduler] 5-min market data collection cycle completed.",
  );
}
