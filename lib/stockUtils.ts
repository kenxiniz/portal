/* lib/stockUtils.ts */

// --- Existing StockDataPoint & TradingSignal Interfaces (Keep as is) ---
export interface StockDataPoint {
  date: string /* YYYY-MM-DD 형식의 문자열 */;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number; // Optional
  bollingerBands?: {
    // Optional
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

// --- ✅ [수정] 아래 타입을 추가하고 인터페이스를 수정합니다 ---
/**
 * Represents the structure for storing Gemini AI advice, including error status.
 */
export interface AdviceObject {
  error: boolean; // True if generation failed, false otherwise
  message: string; // The advice text or the error details
}

export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
  signals: TradingSignal[];
  // [REMOVED] advice: AdviceObject | null;
}

export interface CachedStockData {
  lastFetch: string;
  data: StockDataPoint[];
  signals?: TradingSignal[]; // [ADDED] Signals are now part of the cache
  advice?: AdviceObject | null; // Changed from string | null (optional)
}
// --- ✅ [수정] 여기까지 수정 ---

// --- Existing functions (calculateRSI, calculateBollingerBands, analyzeAllTradingSignals) ---
// (Keep existing function code with previous fixes)
export const calculateRSI = (
  data: StockDataPoint[],
  period: number = 14,
): StockDataPoint[] => {
  if (data.length <= period) return data;
  const rsiData = [...data];
  let avgGain = 0,
    avgLoss = 0;
  // Initialize avgGain and avgLoss for the first period
  for (let i = 1; i <= period; i++) {
    // Add checks for data existence
    if (!rsiData[i] || !rsiData[i - 1]) continue;
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  // Avoid division by zero if period is 0 or less (though unlikely with default)
  if (period > 0) {
    avgGain /= period;
    avgLoss /= period;
  }

  // Calculate first RSI value
  if (rsiData[period]) {
    // Check if rsiData[period] exists
    rsiData[period].rsi =
      100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  }

  // Calculate subsequent RSI values using Wilder's smoothing method
  for (let i = period + 1; i < rsiData.length; i++) {
    // Add checks for data existence
    if (!rsiData[i] || !rsiData[i - 1]) continue;
    const diff = rsiData[i].close - rsiData[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    // Avoid division by zero if period is 0 or less
    if (period > 0) {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (rsiData[i]) {
      // Check if rsiData[i] exists
      rsiData[i].rsi =
        100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
    }
  }
  return rsiData;
};

export const calculateBollingerBands = (
  data: StockDataPoint[],
  period: number = 20,
  stdDev: number = 2,
): StockDataPoint[] => {
  if (data.length < period) return data; // Not enough data for calculation

  const bbData = [...data]; // Create a copy to avoid mutating original data

  for (let i = period - 1; i < bbData.length; i++) {
    // Get the slice of data for the current period
    const slice = bbData.slice(i - period + 1, i + 1);

    // Calculate the sum of closing prices in the slice
    const sum = slice.reduce((acc, val) => acc + val.close, 0);

    // Calculate the middle band (Simple Moving Average)
    // Avoid division by zero
    const middle = period > 0 ? sum / period : 0;

    // Calculate the variance
    // Avoid division by zero
    const variance =
      period > 0
        ? slice.reduce((acc, val) => acc + Math.pow(val.close - middle, 2), 0) /
          period
        : 0;

    // Calculate the standard deviation
    const standardDeviation = Math.sqrt(variance);

    if (bbData[i]) {
      // Check if bbData[i] exists
      // Calculate upper and lower bands
      bbData[i].bollingerBands = {
        middle: middle,
        upper: middle + standardDeviation * stdDev,
        lower: middle - standardDeviation * stdDev,
      };
    }
  }
  return bbData;
};

export const analyzeAllTradingSignals = (
  data: StockDataPoint[],
): TradingSignal[] => {
  if (data.length === 0) return []; // Return empty if no data

  const signals: TradingSignal[] = [];
  let lastBuySignal: TradingSignal | null = null;
  let lastInverseBuySignal: TradingSignal | null = null;

  /* 쌍바닥 찾기 상태 변수 */
  let firstTrough: StockDataPoint | null = null;
  let firstTroughIndex: number | null = null;
  let potentialSecondTrough: StockDataPoint | null = null;

  /* 쌍봉 찾기 상태 변수 */
  let firstPeak: StockDataPoint | null = null;
  let firstPeakIndex: number | null = null;
  let potentialSecondPeak: StockDataPoint | null = null;

  for (let i = 1; i < data.length; i++) {
    const currentPoint = data[i];
    const prevPoint = data[i - 1];

    // Ensure RSI exists for *both* points before proceeding
    // Also check if points themselves exist
    if (
      !currentPoint ||
      !prevPoint ||
      currentPoint.rsi === undefined ||
      prevPoint.rsi === undefined
    )
      continue;

    /* --- 쌍바닥 (매수) 신호 로직 --- */
    if (potentialSecondTrough && firstTrough) {
      if (currentPoint.close > potentialSecondTrough.close) {
        const buySignal: TradingSignal = {
          date: potentialSecondTrough.date,
          startDate: firstTrough.date,
          type: "buy",
          reason: "매수 (RSI 쌍바닥)",
          entryPrice: potentialSecondTrough.close,
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
        if (prevPoint.rsi < 30 && currentPoint.rsi > prevPoint.rsi) {
          firstTrough = prevPoint;
          firstTroughIndex = i - 1;
        }
      } else {
        // Ensure firstTroughIndex is not null before calculating daysSinceFirstTrough
        if (firstTroughIndex === null) {
          firstTrough = null; // Should not happen if firstTrough is set, but defensive check
          continue;
        }
        const daysSinceFirstTrough = i - firstTroughIndex;

        // Check if firstTrough.rsi is defined before comparing
        if (
          firstTrough.rsi !== undefined &&
          currentPoint.rsi < firstTrough.rsi
        ) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 90) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 5) {
          // Check if firstTrough.rsi is defined before comparing
          if (
            firstTrough.rsi !== undefined &&
            currentPoint.close < firstTrough.close &&
            currentPoint.rsi > firstTrough.rsi // Bullish Divergence
          ) {
            potentialSecondTrough = currentPoint;
          }
        }
      }
    }

    /* --- 쌍봉 (인버스 매수) 신호 로직 --- */
    if (potentialSecondPeak && firstPeak) {
      if (currentPoint.close < potentialSecondPeak.close) {
        const inverseBuySignal: TradingSignal = {
          date: potentialSecondPeak.date,
          startDate: firstPeak.date,
          type: "inverse-buy",
          reason: "인버스 매수 (RSI 쌍봉)",
          entryPrice: potentialSecondPeak.close,
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
        if (prevPoint.rsi > 70 && currentPoint.rsi < prevPoint.rsi) {
          firstPeak = prevPoint;
          firstPeakIndex = i - 1;
        }
      } else {
        // Ensure firstPeakIndex is not null
        if (firstPeakIndex === null) {
          firstPeak = null;
          continue;
        }
        const daysSinceFirstPeak = i - firstPeakIndex;

        // Check if firstPeak.rsi is defined before comparing
        if (firstPeak.rsi !== undefined && currentPoint.rsi > firstPeak.rsi) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 90) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 5) {
          // Check if firstPeak.rsi is defined before comparing
          if (
            firstPeak.rsi !== undefined &&
            currentPoint.close > firstPeak.close &&
            currentPoint.rsi < firstPeak.rsi // Bearish Divergence
          ) {
            potentialSecondPeak = currentPoint;
          }
        }
      }
    }

    /* --- 수익 실현 (Sell) 신호 로직 --- */
    if (currentPoint.bollingerBands) {
      // Check if bands exist
      // Check lastBuySignal and its entryPrice before using them
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
      }
      // Check lastInverseBuySignal and its entryPrice before using them
      else if (
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

  // Ensure signals are unique per date and reason
  const uniqueSignalsMap = new Map<string, TradingSignal>();
  signals.forEach((s) => {
    uniqueSignalsMap.set(`${s.date}-${s.reason}`, s);
  });
  const uniqueSignals = Array.from(uniqueSignalsMap.values());

  // Add a final 'hold' signal if needed
  if (data.length > 0) {
    // Safely access the last element's date
    const lastDataPointDate = data[data.length - 1]?.date;
    const lastSignalDate =
      uniqueSignals.length > 0
        ? uniqueSignals[uniqueSignals.length - 1]?.date
        : null;

    if (lastDataPointDate && lastSignalDate !== lastDataPointDate) {
      uniqueSignals.push({
        date: lastDataPointDate,
        type: "hold",
        reason: "관망 (중립 구간)",
      });
    }
  }

  // Sort signals chronologically
  return uniqueSignals.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
};
// --- End of analyzeAllTradingSignals function ---
