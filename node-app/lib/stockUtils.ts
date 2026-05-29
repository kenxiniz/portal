/* lib/stockUtils.ts */

import {
  calculateKAMA,
  calculateVWAP,
  calculateGaussianLine,
  calculateKamaTrend,
  calculateGaussianTrend,
  calculateVwapRetest,
  calculateMacdKama,
} from "@/lib/charts/indicators";

export {
  calculateRSI,
  calculateBollingerBands,
  calculateGaussianLine,
} from "@/lib/charts/indicators";

const getEnvNumber = (key: string, defaultValue: number): number => {
  const val = process.env[key] || process.env[`NEXT_PUBLIC_${key}`];
  if (val !== undefined && val !== "") {
    const parsed = Number(val);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
};

const TRADING_CONFIG = {
  get stopLossPercent() {
    return getEnvNumber("STOP_LOSS_PERCENT", -8.0);
  },
  get timeLimit1dDays() {
    return getEnvNumber("TIME_LIMIT_1D_DAYS", 30);
  },
  get timeLimitOtherDays() {
    return getEnvNumber("TIME_LIMIT_OTHER_DAYS", 7);
  },
  get rsiOversold() {
    return getEnvNumber("RSI_OVERSOLD", 30);
  },
  get rsiOverbought() {
    return getEnvNumber("RSI_OVERBOUGHT", 70);
  },
  get divergenceMinDays() {
    return getEnvNumber("DIVERGENCE_MIN_DAYS", 5);
  },
  get divergenceMaxDays() {
    return getEnvNumber("DIVERGENCE_MAX_DAYS", 90);
  },
};

export interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number;
  bollingerBands?: {
    middle: number;
    upper: number;
    lower: number;
  };
  vwap?: number;
  ema9?: number;
  ema20?: number;
  kama?: number;
  kamaTrend?: {
    isUp: boolean;
    isDown: boolean;
    isGold?: boolean;
    isDead?: boolean;
  };
  gaussian?: number;
  gaussianTrend?: { isUp: boolean; isDown: boolean };
  vwapRetest?: { isBullishRetest: boolean; isBearishRetest: boolean };
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
}

export interface TradingSignal {
  date: string;
  startDate?: string;
  type: "buy" | "sell" | "inverse-buy" | "hold";
  reason: string;
  details?: string;
  entryPrice?: number;
  profitRate?: number;
  realizedPrice?: number;
  currentPrice?: number;
}

export interface AdviceObject {
  error: boolean;
  message: string;
  action?: string;
}

export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
  signals: TradingSignal[];
  advice: AdviceObject | null;
}

export interface CachedStockData {
  lastFetch: string;
  data: StockDataPoint[];
  signals?: TradingSignal[];
  advice?: AdviceObject | null;
}

// 💡 파라미터에 isInverse 추가 (기본값 false 설정으로 하위 호환 유지)
export const analyzeAllTradingSignals = (
  data: StockDataPoint[],
  timeframe: "1d" | "1h" | "15m" = "1d",
  isInverse: boolean = false,
): TradingSignal[] => {
  if (data.length === 0) return [];

  const signals: TradingSignal[] = [];
  let lastBuySignal: TradingSignal | null = null;
  let lastInverseBuySignal: TradingSignal | null = null;

  let firstTrough: StockDataPoint | null = null;
  let firstTroughIndex: number | null = null;
  let potentialSecondTrough: StockDataPoint | null = null;

  let firstPeak: StockDataPoint | null = null;
  let firstPeakIndex: number | null = null;
  let potentialSecondPeak: StockDataPoint | null = null;

  let isBullishSetupActive = false;
  let bullishSetupStartDate = "";
  let isBearishSetupActive = false;
  let bearishSetupStartDate = "";

  const expirationMs =
    timeframe === "1d"
      ? TRADING_CONFIG.timeLimit1dDays * 24 * 60 * 60 * 1000
      : TRADING_CONFIG.timeLimitOtherDays * 24 * 60 * 60 * 1000;

  const minDivergenceBars =
    timeframe === "1d"
      ? TRADING_CONFIG.divergenceMinDays
      : TRADING_CONFIG.divergenceMinDays;

  const closePrices = data.map((d) => d.close);
  const highPrices = data.map((d) => d.high);
  const lowPrices = data.map((d) => d.low);

  const localVwapData = calculateVWAP(data, timeframe);

  const kamaData = calculateKAMA(closePrices, 10);
  const kamaTrends = calculateKamaTrend(kamaData, closePrices);

  const gaussianData = calculateGaussianLine(closePrices, 20, 3);
  const gaussianTrends = calculateGaussianTrend(gaussianData);

  const vwapRetests = calculateVwapRetest(
    closePrices,
    highPrices,
    lowPrices,
    localVwapData,
  );

  const { macdLineRaw, signalLineRaw, histogramRaw } =
    calculateMacdKama(closePrices);

  for (let i = 0; i < data.length; i++) {
    data[i].vwap =
      localVwapData[i] !== null ? (localVwapData[i] as number) : undefined;
    data[i].kama = kamaData[i] !== null ? (kamaData[i] as number) : undefined;
    data[i].kamaTrend = kamaTrends[i];
    data[i].gaussian =
      gaussianData[i] !== null ? (gaussianData[i] as number) : undefined;
    data[i].gaussianTrend = gaussianTrends[i];
    data[i].vwapRetest = vwapRetests[i];
    data[i].macd =
      macdLineRaw[i] !== null ? (macdLineRaw[i] as number) : undefined;
    data[i].macdSignal =
      signalLineRaw[i] !== null ? (signalLineRaw[i] as number) : undefined;
    data[i].macdHist =
      histogramRaw[i] !== null ? (histogramRaw[i] as number) : undefined;
  }

  for (let i = 1; i < data.length; i++) {
    const currentPoint = data[i];
    const prevPoint = data[i - 1];

    if (
      !currentPoint ||
      !prevPoint ||
      currentPoint.rsi === undefined ||
      prevPoint.rsi === undefined
    )
      continue;

    const currentTimestamp = new Date(
      currentPoint.date.includes(" ")
        ? currentPoint.date.replace(" ", "T")
        : currentPoint.date,
    ).getTime();

    // 1. Global stop-loss and time limit
    if (lastBuySignal && lastBuySignal.entryPrice !== undefined) {
      const buyTimestamp = new Date(
        lastBuySignal.date.includes(" ")
          ? lastBuySignal.date.replace(" ", "T")
          : lastBuySignal.date,
      ).getTime();
      const profitRate =
        ((currentPoint.close - lastBuySignal.entryPrice) /
          lastBuySignal.entryPrice) *
        100;

      if (profitRate <= TRADING_CONFIG.stopLossPercent) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          // 💡 일반 종목이 매수된 상황이라도 isInverse이면 과열 참고 신호로 텍스트 변경
          reason: isInverse
            ? `과열 참고 신호 무효화 (${TRADING_CONFIG.stopLossPercent}% 도달)`
            : `자동 손절 (${TRADING_CONFIG.stopLossPercent}% 도달)`,
          realizedPrice: currentPoint.close,
          currentPrice: currentPoint.close,
          profitRate: profitRate,
          details: `Stop-loss triggered: ${profitRate.toFixed(2)}%`,
        });
        lastBuySignal = null;
      } else if (currentTimestamp - buyTimestamp >= expirationMs) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason: isInverse
            ? "과열 참고 신호 만료 (시간 제한)"
            : profitRate >= 0
              ? "시간 제한 익절 (기간 만료)"
              : "시간 제한 손절 (기간 만료)",
          realizedPrice: currentPoint.close,
          currentPrice: currentPoint.close,
          profitRate: profitRate,
          details: `Time limit exceeded: ${profitRate.toFixed(2)}%`,
        });
        lastBuySignal = null;
      }
    } else if (
      lastInverseBuySignal &&
      lastInverseBuySignal.entryPrice !== undefined
    ) {
      const invBuyTimestamp = new Date(
        lastInverseBuySignal.date.includes(" ")
          ? lastInverseBuySignal.date.replace(" ", "T")
          : lastInverseBuySignal.date,
      ).getTime();
      const profitRate =
        ((lastInverseBuySignal.entryPrice - currentPoint.close) /
          lastInverseBuySignal.entryPrice) *
        100;

      if (profitRate <= TRADING_CONFIG.stopLossPercent) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason: `과열 참고 신호 무효화 (${TRADING_CONFIG.stopLossPercent}% 도달)`,
          realizedPrice: currentPoint.close,
          currentPrice: currentPoint.close,
          profitRate: profitRate,
          details: `Stop-loss triggered: ${profitRate.toFixed(2)}%`,
        });
        lastInverseBuySignal = null;
      } else if (currentTimestamp - invBuyTimestamp >= expirationMs) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason: "과열 참고 신호 만료 (시간 제한)",
          realizedPrice: currentPoint.close,
          currentPrice: currentPoint.close,
          profitRate: profitRate,
          details: `Time limit exceeded: ${profitRate.toFixed(2)}%`,
        });
        lastInverseBuySignal = null;
      }
    }

    // 2. Intraday triggers
    let isIntradayBullishTrigger = false;
    let isIntradayBearishTrigger = false;

    if (timeframe !== "1d") {
      const kamaStatus = kamaTrends[i];
      const probStatus = gaussianTrends[i];
      const retestStatus = vwapRetests[i];

      if (
        retestStatus.isBullishRetest &&
        (kamaStatus.isUp || kamaStatus.isGold) &&
        probStatus.isUp
      ) {
        isIntradayBullishTrigger = true;
      }

      if (
        retestStatus.isBearishRetest &&
        (kamaStatus.isDown || kamaStatus.isDead) &&
        probStatus.isDown
      ) {
        isIntradayBearishTrigger = true;
      }

      if (isBullishSetupActive && !lastBuySignal) {
        if (
          currentPoint.bollingerBands &&
          currentPoint.high >= currentPoint.bollingerBands.upper
        ) {
          isBullishSetupActive = false;
        } else if (isIntradayBullishTrigger) {
          const buySignal: TradingSignal = {
            date: currentPoint.date,
            startDate: bullishSetupStartDate,
            type: "buy",
            reason: isInverse
              ? "시장 과열 참고 신호 (쌍바닥+VWAP리테스트+KAMA+Prob상승)"
              : "매수 (쌍바닥+VWAP리테스트+KAMA+Prob상승)",
            entryPrice: currentPoint.close,
            currentPrice: currentPoint.close,
            details:
              "RSI 쌍바닥 이후 VWAP 5봉 이상 방어 리테스트 성공 및 KAMA/Gaussian 상승 전환",
          };
          signals.push(buySignal);
          lastBuySignal = buySignal;
          isBullishSetupActive = false;
        }
      }

      if (isBearishSetupActive && !lastInverseBuySignal) {
        if (
          currentPoint.bollingerBands &&
          currentPoint.low <= currentPoint.bollingerBands.lower
        ) {
          isBearishSetupActive = false;
        } else if (isIntradayBearishTrigger) {
          const inverseBuySignal: TradingSignal = {
            date: currentPoint.date,
            startDate: bearishSetupStartDate,
            type: "inverse-buy",
            reason: "시장 과열 참고 신호 (쌍봉+VWAP리테스트+KAMA+Prob하락)",
            entryPrice: currentPoint.close,
            currentPrice: currentPoint.close,
            details:
              "RSI 쌍봉 이후 VWAP 5봉 이상 하회 리테스트 성공 및 KAMA/Gaussian 하락 전환",
          };
          signals.push(inverseBuySignal);
          lastInverseBuySignal = inverseBuySignal;
          isBearishSetupActive = false;
        }
      }
    }

    // 3. Setup Logic
    if (potentialSecondTrough && firstTrough) {
      if (currentPoint.close > potentialSecondTrough.close) {
        if (timeframe === "1d") {
          const buySignal: TradingSignal = {
            date: currentPoint.date,
            startDate: firstTrough.date,
            type: "buy",
            reason: isInverse
              ? "시장 과열 참고 신호 (RSI 쌍바닥)"
              : "매수 (RSI 쌍바닥)",
            entryPrice: currentPoint.close,
            currentPrice: currentPoint.close,
            details: `RSI Bullish Divergence`,
          };
          signals.push(buySignal);
          lastBuySignal = buySignal;
        } else {
          isBullishSetupActive = true;
          bullishSetupStartDate = firstTrough.date;
        }
        firstTrough = null;
        firstTroughIndex = null;
        potentialSecondTrough = null;
      } else {
        if (currentPoint.rsi < firstTrough.rsi!) {
          potentialSecondTrough = null;
          firstTrough = null;
          firstTroughIndex = null;
        } else {
          potentialSecondTrough = currentPoint;
        }
      }
    }

    if (!potentialSecondTrough) {
      if (!firstTrough) {
        if (
          prevPoint.rsi < TRADING_CONFIG.rsiOversold &&
          currentPoint.rsi > prevPoint.rsi
        ) {
          firstTrough = prevPoint;
          firstTroughIndex = i - 1;
        }
      } else {
        if (firstTroughIndex === null) {
          firstTrough = null;
          continue;
        }
        const daysSinceFirstTrough = i - firstTroughIndex;

        if (currentPoint.rsi < firstTrough.rsi!) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > TRADING_CONFIG.divergenceMaxDays) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > minDivergenceBars) {
          if (
            currentPoint.close < firstTrough.close &&
            currentPoint.rsi > firstTrough.rsi!
          ) {
            potentialSecondTrough = currentPoint;
          }
        }
      }
    }

    if (potentialSecondPeak && firstPeak) {
      if (currentPoint.close < potentialSecondPeak.close) {
        if (timeframe === "1d") {
          const inverseBuySignal: TradingSignal = {
            date: currentPoint.date,
            startDate: firstPeak.date,
            type: "inverse-buy",
            reason: "시장 과열 참고 신호 (RSI 쌍봉)",
            entryPrice: currentPoint.close,
            currentPrice: currentPoint.close,
            details: `RSI Bearish Divergence`,
          };
          signals.push(inverseBuySignal);
          lastInverseBuySignal = inverseBuySignal;
        } else {
          isBearishSetupActive = true;
          bearishSetupStartDate = firstPeak.date;
        }
        firstPeak = null;
        firstPeakIndex = null;
        potentialSecondPeak = null;
      } else {
        if (currentPoint.rsi > firstPeak.rsi!) {
          potentialSecondPeak = null;
          firstPeak = null;
          firstPeakIndex = null;
        } else {
          potentialSecondPeak = currentPoint;
        }
      }
    }

    if (!potentialSecondPeak) {
      if (!firstPeak) {
        if (
          prevPoint.rsi > TRADING_CONFIG.rsiOverbought &&
          currentPoint.rsi < prevPoint.rsi
        ) {
          firstPeak = prevPoint;
          firstPeakIndex = i - 1;
        }
      } else {
        if (firstPeakIndex === null) {
          firstPeak = null;
          continue;
        }
        const daysSinceFirstPeak = i - firstPeakIndex;

        if (currentPoint.rsi > firstPeak.rsi!) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > TRADING_CONFIG.divergenceMaxDays) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > minDivergenceBars) {
          if (
            currentPoint.close > firstPeak.close &&
            currentPoint.rsi < firstPeak.rsi!
          ) {
            potentialSecondPeak = currentPoint;
          }
        }
      }
    }

    // 4. Sell Signal Logic (Bollinger Bands)
    if (currentPoint.bollingerBands) {
      // 4-1. Long Position Exit
      if (lastBuySignal && lastBuySignal.entryPrice !== undefined) {
        let triggeredExit = false;
        let exitPrice = 0;
        let reasonBase = "";
        let details = "";

        // Take profit (BB Upper)
        if (
          timeframe === "1d" &&
          currentPoint.close >= currentPoint.bollingerBands.upper
        ) {
          triggeredExit = true;
          exitPrice = currentPoint.close;
          reasonBase = "BB 상단 도달";
          details = `BB Upper: ${currentPoint.bollingerBands.upper.toFixed(2)}`;
        } else if (
          timeframe !== "1d" &&
          currentPoint.high >= currentPoint.bollingerBands.upper
        ) {
          triggeredExit = true;
          exitPrice = currentPoint.bollingerBands.upper;
          reasonBase = "BB 상단 도달";
          details = `BB Upper: ${currentPoint.bollingerBands.upper.toFixed(2)}`;
        }
        // Dynamic stop loss (BB Lower AND Loss >= 5%)
        else {
          let isBbLowerBreach = false;
          let tempExitPrice = 0;

          if (
            timeframe === "1d" &&
            currentPoint.close <= currentPoint.bollingerBands.lower
          ) {
            isBbLowerBreach = true;
            tempExitPrice = currentPoint.close;
          } else if (
            timeframe !== "1d" &&
            currentPoint.low <= currentPoint.bollingerBands.lower
          ) {
            isBbLowerBreach = true;
            tempExitPrice = currentPoint.bollingerBands.lower;
          }

          if (isBbLowerBreach) {
            const tempProfitRate =
              ((tempExitPrice - lastBuySignal.entryPrice) /
                lastBuySignal.entryPrice) *
              100;
            // Trigger exit only if the current loss is 5% or more
            if (tempProfitRate <= -5.0) {
              triggeredExit = true;
              exitPrice = tempExitPrice;
              reasonBase = "BB 하단 이탈 & 5% 이상 손실";
              details = `BB Lower: ${currentPoint.bollingerBands.lower.toFixed(2)}`;
            }
          }
        }

        if (triggeredExit) {
          const profitRate =
            ((exitPrice - lastBuySignal.entryPrice) /
              lastBuySignal.entryPrice) *
            100;
          signals.push({
            date: currentPoint.date,
            type: "sell",
            // 💡 일반 종목 매수 조건이었어도 isInverse면 텍스트 변환
            reason: isInverse
              ? `과열 참고 신호 해제 (${reasonBase})`
              : profitRate >= 0
                ? `수익 실현 (${reasonBase})`
                : `손절 (${reasonBase})`,
            realizedPrice: exitPrice,
            currentPrice: exitPrice,
            profitRate: profitRate,
            details: details,
          });
          lastBuySignal = null;
        }
      }

      // 4-2. Short (Inverse) Position Exit
      if (
        lastInverseBuySignal &&
        lastInverseBuySignal.entryPrice !== undefined
      ) {
        let triggeredExit = false;
        let exitPrice = 0;
        let reasonBase = "";
        let details = "";

        // Take profit (BB Lower)
        if (
          timeframe === "1d" &&
          currentPoint.close <= currentPoint.bollingerBands.lower
        ) {
          triggeredExit = true;
          exitPrice = currentPoint.close;
          reasonBase = "BB 하단 도달";
          details = `BB Lower: ${currentPoint.bollingerBands.lower.toFixed(2)}`;
        } else if (
          timeframe !== "1d" &&
          currentPoint.low <= currentPoint.bollingerBands.lower
        ) {
          triggeredExit = true;
          exitPrice = currentPoint.bollingerBands.lower;
          reasonBase = "BB 하단 도달";
          details = `BB Lower: ${currentPoint.bollingerBands.lower.toFixed(2)}`;
        }
        // Dynamic stop loss (BB Upper AND Loss >= 5%)
        else {
          let isBbUpperBreach = false;
          let tempExitPrice = 0;

          if (
            timeframe === "1d" &&
            currentPoint.close >= currentPoint.bollingerBands.upper
          ) {
            isBbUpperBreach = true;
            tempExitPrice = currentPoint.close;
          } else if (
            timeframe !== "1d" &&
            currentPoint.high >= currentPoint.bollingerBands.upper
          ) {
            isBbUpperBreach = true;
            tempExitPrice = currentPoint.bollingerBands.upper;
          }

          if (isBbUpperBreach) {
            const tempProfitRate =
              ((lastInverseBuySignal.entryPrice - tempExitPrice) /
                lastInverseBuySignal.entryPrice) *
              100;
            // Trigger exit only if the current loss is 5% or more
            if (tempProfitRate <= -5.0) {
              triggeredExit = true;
              exitPrice = tempExitPrice;
              reasonBase = "BB 상단 돌파 & 5% 이상 손실";
              details = `BB Upper: ${currentPoint.bollingerBands.upper.toFixed(2)}`;
            }
          }
        }

        if (triggeredExit) {
          const profitRate =
            ((lastInverseBuySignal.entryPrice - exitPrice) /
              lastInverseBuySignal.entryPrice) *
            100;
          signals.push({
            date: currentPoint.date,
            type: "sell",
            reason: `과열 참고 신호 해제 (${reasonBase})`,
            realizedPrice: exitPrice,
            currentPrice: exitPrice,
            profitRate: profitRate,
            details: details,
          });
          lastInverseBuySignal = null;
        }
      }
    }
  } // End of For Loop

  const uniqueSignalsMap = new Map<string, TradingSignal>();
  signals.forEach((s) => {
    uniqueSignalsMap.set(`${s.date}-${s.reason}`, s);
  });

  const uniqueSignals = Array.from(uniqueSignalsMap.values());

  if (data.length > 0) {
    const lastDataPoint = data[data.length - 1];
    const hasSignalOnLastDate = uniqueSignals.some(
      (s) => s.date === lastDataPoint.date,
    );

    if (!hasSignalOnLastDate) {
      uniqueSignals.push({
        date: lastDataPoint.date,
        type: "hold",
        reason: "관망 (중립 구간)",
        realizedPrice: lastDataPoint.close,
        currentPrice: lastDataPoint.close,
      });
    }
  }

  return uniqueSignals.sort(
    (a, b) =>
      new Date(
        a.date.includes(" ") ? a.date.replace(" ", "T") : a.date,
      ).getTime() -
      new Date(
        b.date.includes(" ") ? b.date.replace(" ", "T") : b.date,
      ).getTime(),
  );
};
