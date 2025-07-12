/* lib/stockUtils.ts */

export interface StockDataPoint {
  date: string; /* YYYY-MM-DD 형식의 문자열 */
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
  type: 'buy' | 'sell' | 'inverse-buy' | 'hold';
  reason: string;
  details?: string;
  entryPrice?: number;
  profitRate?: number;
  realizedPrice?: number;
}

export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
  signals: TradingSignal[];
}

export interface CachedStockData {
  lastFetch: string;
  data: StockDataPoint[];
}


export const calculateRSI = (data: StockDataPoint[], period: number = 14): StockDataPoint[] => {
  if (data.length <= period) return data;
  const rsiData = [...data];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  rsiData[period].rsi = 100 - (100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss)));
  for (let i = period + 1; i < rsiData.length; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    rsiData[i].rsi = 100 - (100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss)));
  }
  return rsiData;
};

export const calculateBollingerBands = (data: StockDataPoint[], period: number = 20, stdDev: number = 2): StockDataPoint[] => {
  if (data.length < period) return data;
  const bbData = [...data];
  for (let i = period - 1; i < bbData.length; i++) {
    const slice = bbData.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + val.close, 0);
    const middle = sum / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val.close - middle, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    bbData[i].bollingerBands = {
      middle: middle,
      upper: middle + (standardDeviation * stdDev),
      lower: middle - (standardDeviation * stdDev),
    };
  }
  return bbData;
};

export const analyzeAllTradingSignals = (data: StockDataPoint[]): TradingSignal[] => {
  if (data.length === 0) return [];

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

    /* --- 쌍바닥 (매수) 신호 로직 --- */
    if (potentialSecondTrough && firstTrough) {
      if (currentPoint.close > potentialSecondTrough.close) {
        const buySignal: TradingSignal = {
          date: potentialSecondTrough.date,
          startDate: firstTrough.date,
          type: 'buy',
          reason: '매수 (RSI 쌍바닥)',
          entryPrice: potentialSecondTrough.close,
          details: `RSI 상승 다이버전스`
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
        if (prevPoint.rsi! < 30 && currentPoint.rsi! > prevPoint.rsi!) {
          firstTrough = prevPoint;
          firstTroughIndex = i - 1;
        }
      } else {
        const daysSinceFirstTrough = i - firstTroughIndex!;
        if (currentPoint.rsi! < firstTrough.rsi!) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 90) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 5) {
          if (currentPoint.close < firstTrough.close && currentPoint.rsi! > firstTrough.rsi!) {
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
          type: 'inverse-buy',
          reason: '인버스 매수 (RSI 쌍봉)',
          entryPrice: potentialSecondPeak.close,
          details: `RSI 하락 다이버전스`
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
        if (prevPoint.rsi! > 70 && currentPoint.rsi! < prevPoint.rsi!) {
          firstPeak = prevPoint;
          firstPeakIndex = i - 1;
        }
      } else {
        const daysSinceFirstPeak = i - firstPeakIndex!;
        if (currentPoint.rsi! > firstPeak.rsi!) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 90) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 5) {
          if (currentPoint.close > firstPeak.close && currentPoint.rsi! < firstPeak.rsi!) {
            potentialSecondPeak = currentPoint;
          }
        }
      }
    }

    /* ---
     * 수익
     * 실현
     * 신호
     * 로직
     * ---
     *  */
    if (currentPoint.bollingerBands) {
      if (lastBuySignal && currentPoint.close >= currentPoint.bollingerBands.upper) {
        const profitRate = ((currentPoint.close - lastBuySignal.entryPrice!) / lastBuySignal.entryPrice!) * 100;
        signals.push({
date: currentPoint.date,
type: 'sell',
reason: profitRate >= 0 ? '수익 실현 (BB 상단)' : '손실 (BB 상단)',
realizedPrice: currentPoint.close,
profitRate: profitRate,
details: `BB상단: ${currentPoint.bollingerBands.upper.toFixed(2)}`
});
lastBuySignal = null;
}
else if (lastInverseBuySignal && currentPoint.close <= currentPoint.bollingerBands.lower) {
  const profitRate = ((lastInverseBuySignal.entryPrice! - currentPoint.close) / lastInverseBuySignal.entryPrice!) * 100;
  signals.push({
date: currentPoint.date,
type: 'sell',
reason: profitRate >= 0 ? '수익 실현 (BB 하단)' : '손실 (BB 하단)',
realizedPrice: currentPoint.close,
profitRate: profitRate,
details: `BB하단: ${currentPoint.bollingerBands.lower.toFixed(2)}`
});
lastInverseBuySignal = null;
}
}
}

const uniqueSignals = Array.from(new Map(signals.map(s => [`${s.date}-${s.reason}`, s])).values());

    if (data.length > 0) {
      const lastSignalDate = uniqueSignals.length > 0 ? uniqueSignals.at(-1)!.date : null;
      if (lastSignalDate !== data.at(-1)!.date) {
        uniqueSignals.push({
          date: data.at(-1)!.date,
          type: 'hold',
          reason: '관망 (중립 구간)',
        });
      }
    }

    return uniqueSignals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };
