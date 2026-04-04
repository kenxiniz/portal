/* lib/stockUtils.ts */

// --- Configuration ---
// Utility to get environment variables as numbers with fallback
const getEnvNumber = (key: string, defaultValue: number): number => {
  const val = process.env[key] || process.env[`NEXT_PUBLIC_${key}`];
  if (val !== undefined && val !== "") {
    const parsed = Number(val);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
};

// Define trading parameters utilizing environment variables
const TRADING_CONFIG = {
  get stopLossPercent() {
    return getEnvNumber("STOP_LOSS_PERCENT", -5.0);
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

// --- Interfaces ---

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
}

export interface AdviceObject {
  error: boolean;
  message: string;
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

// --- Technical Indicators ---

export const calculateRSI = (
  data: StockDataPoint[],
  period: number = 14,
): StockDataPoint[] => {
  if (data.length === 0) return [];

  const rsiData = data.map((item) => ({
    ...item,
    rsi: undefined as number | undefined,
  }));

  if (data.length <= period) return rsiData;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  if (rsiData[period]) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiData[period].rsi = 100 - 100 / (1 + rs);
  }

  for (let i = period + 1; i < rsiData.length; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiData[i].rsi = 100 - 100 / (1 + rs);
  }

  return rsiData;
};

export const calculateBollingerBands = (
  data: StockDataPoint[],
  period: number = 20,
  stdDev: number = 2,
): StockDataPoint[] => {
  const bbData = data.map((item) => ({
    ...item,
    bollingerBands: undefined as StockDataPoint["bollingerBands"],
  }));

  if (data.length < period) return bbData;

  for (let i = period - 1; i < bbData.length; i++) {
    const slice = bbData.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + val.close, 0);
    const middle = sum / period;

    const variance =
      slice.reduce((acc, val) => acc + Math.pow(val.close - middle, 2), 0) /
      period;
    const standardDeviation = Math.sqrt(variance);

    bbData[i].bollingerBands = {
      middle: middle,
      upper: middle + standardDeviation * stdDev,
      lower: middle - standardDeviation * stdDev,
    };
  }
  return bbData;
};

// --- Signal Analysis ---

export const analyzeAllTradingSignals = (
  data: StockDataPoint[],
  timeframe: "1d" | "1h" | "15m" = "1d",
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

  const expirationMs =
    timeframe === "1d"
      ? TRADING_CONFIG.timeLimit1dDays * 24 * 60 * 60 * 1000
      : TRADING_CONFIG.timeLimitOtherDays * 24 * 60 * 60 * 1000;

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
          reason: `자동 손절 (${TRADING_CONFIG.stopLossPercent}% 도달)`,
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `손절가 도달: ${profitRate.toFixed(2)}%`,
        });
        lastBuySignal = null;
      } else if (currentTimestamp - buyTimestamp >= expirationMs) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason:
            profitRate >= 0
              ? "시간 제한 익절 (기간 만료)"
              : "시간 제한 손절 (기간 만료)",
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `보유 한도 초과: ${profitRate.toFixed(2)}%`,
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
          reason: `자동 손절 (${TRADING_CONFIG.stopLossPercent}% 도달)`,
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `손절가 도달: ${profitRate.toFixed(2)}%`,
        });
        lastInverseBuySignal = null;
      } else if (currentTimestamp - invBuyTimestamp >= expirationMs) {
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason:
            profitRate >= 0
              ? "시간 제한 익절 (인버스 만료)"
              : "시간 제한 손절 (인버스 만료)",
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `보유 한도 초과: ${profitRate.toFixed(2)}%`,
        });
        lastInverseBuySignal = null;
      }
    }

    /* --- Buy Signal Logic --- */
    if (potentialSecondTrough && firstTrough) {
      if (currentPoint.close > potentialSecondTrough.close) {
        const buySignal: TradingSignal = {
          // [FIX] Record the date of the current candle where the signal is confirmed
          date: currentPoint.date,
          startDate: firstTrough.date,
          type: "buy",
          reason: "매수 (RSI 쌍바닥)",
          // [FIX] The entry price should be the close price of the confirming candle
          entryPrice: currentPoint.close,
          details: `RSI 상승 다이버전스`,
        };
        signals.push(buySignal);
        lastBuySignal = buySignal;
        firstTrough = null;
        firstTroughIndex = null;
        potentialSecondTrough = null;
      } else {
        potentialSecondTrough = null;
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
        } else if (daysSinceFirstTrough > TRADING_CONFIG.divergenceMinDays) {
          if (
            currentPoint.close < firstTrough.close &&
            currentPoint.rsi > firstTrough.rsi!
          ) {
            potentialSecondTrough = currentPoint;
          }
        }
      }
    }

    /* --- Inverse Buy Signal Logic --- */
    if (potentialSecondPeak && firstPeak) {
      if (currentPoint.close < potentialSecondPeak.close) {
        const inverseBuySignal: TradingSignal = {
          // [FIX] Record the date of the current candle where the signal is confirmed
          date: currentPoint.date,
          startDate: firstPeak.date,
          type: "inverse-buy",
          reason: "인버스 매수 (RSI 쌍봉)",
          // [FIX] The entry price should be the close price of the confirming candle
          entryPrice: currentPoint.close,
          details: `RSI 하락 다이버전스`,
        };
        signals.push(inverseBuySignal);
        lastInverseBuySignal = inverseBuySignal;
        firstPeak = null;
        firstPeakIndex = null;
        potentialSecondPeak = null;
      } else {
        potentialSecondPeak = null;
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
        } else if (daysSinceFirstPeak > TRADING_CONFIG.divergenceMinDays) {
          if (
            currentPoint.close > firstPeak.close &&
            currentPoint.rsi < firstPeak.rsi!
          ) {
            potentialSecondPeak = currentPoint;
          }
        }
      }
    }

    /* --- Sell Signal Logic --- */
    if (currentPoint.bollingerBands) {
      if (
        lastBuySignal &&
        lastBuySignal.entryPrice !== undefined &&
        currentPoint.close >= currentPoint.bollingerBands.upper
      ) {
        const profitRate =
          ((currentPoint.close - lastBuySignal.entryPrice) /
            lastBuySignal.entryPrice) *
          100;
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason: profitRate >= 0 ? "수익 실현 (BB 상단)" : "손실 (BB 상단)",
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `BB상단: ${currentPoint.bollingerBands.upper.toFixed(2)}`,
        });
        lastBuySignal = null;
      } else if (
        lastInverseBuySignal &&
        lastInverseBuySignal.entryPrice !== undefined &&
        currentPoint.close <= currentPoint.bollingerBands.lower
      ) {
        const profitRate =
          ((lastInverseBuySignal.entryPrice - currentPoint.close) /
            lastInverseBuySignal.entryPrice) *
          100;
        signals.push({
          date: currentPoint.date,
          type: "sell",
          reason: profitRate >= 0 ? "수익 실현 (BB 하단)" : "손실 (BB 하단)",
          realizedPrice: currentPoint.close,
          profitRate: profitRate,
          details: `BB하단: ${currentPoint.bollingerBands.lower.toFixed(2)}`,
        });
        lastInverseBuySignal = null;
      }
    }
  }

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
