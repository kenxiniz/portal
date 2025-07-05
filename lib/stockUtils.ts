/* lib/stockUtils.ts */

export interface StockDataPoint {
  date: string; /* yyyy-MM-dd 형식의 문자열 */
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

/* 이하 모든 함수는 변경 없습니다. */
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
  const WINDOW_SIZE = 60;
  if (data.length < WINDOW_SIZE) return [];
  const historicalSignals: TradingSignal[] = [];
  for (let i = WINDOW_SIZE; i < data.length; i++) {
    const currentWindow = data.slice(i - WINDOW_SIZE, i);
    const currentPoint = data[i];
    const troughs = currentWindow.filter((d, j, arr) => j > 0 && j < arr.length - 1 && d.low < arr[j-1].low && d.low < arr[j+1].low);
    const peaks = currentWindow.filter((d, j, arr) => j > 0 && j < arr.length - 1 && d.high > arr[j-1].high && d.high > arr[j+1].high);
    const highRSI70 = peaks.filter(p => p.rsi && p.rsi > 70);
    if (highRSI70.length >= 2) {
      const lastPeak = highRSI70[highRSI70.length - 1];
      if (currentPoint.high > lastPeak.high && currentPoint.rsi! < lastPeak.rsi!) {
        historicalSignals.push({
          startDate: lastPeak.date, date: currentPoint.date, type: 'inverse-buy',
          reason: '인버스 매수 (RSI 쌍봉)',
          details: `주가는 전고점(${lastPeak.high.toFixed(2)})을 돌파했으나 RSI는 하락.`
        });
      }
    }
    const lowRSI30 = troughs.filter(t => t.rsi && t.rsi < 30);
    if (lowRSI30.length >= 2) {
      const lastTrough = lowRSI30[lowRSI30.length - 1];
      if (currentPoint.low < lastTrough.low && currentPoint.rsi! > lastTrough.rsi!) {
        historicalSignals.push({
          startDate: lastTrough.date, date: currentPoint.date, type: 'buy',
          reason: '매수 (RSI 쌍바닥)',
          details: `주가는 전저점(${lastTrough.low.toFixed(2)})보다 하락했으나 RSI는 상승.`
        });
      }
    }
  }
  const lastFiveDays = data.slice(-5);
  lastFiveDays.forEach(d => {
    if (d.bollingerBands && d.close >= d.bollingerBands.upper) {
      historicalSignals.push({
        date: d.date,
        type: 'sell',
        /* [수정] 수익 실현 이유에 'BB 상단'을 명시합니다. */
        reason: '수익 실현 (BB 상단)',
        details: `주가(${d.close.toFixed(2)})가 BB상단(${d.bollingerBands.upper.toFixed(2)}) 도달.`
      });
    }
    /* [추가] BB 하단 터치 시 수익 실현 신호를 추가합니다. */
    if (d.bollingerBands && d.close <= d.bollingerBands.lower) {
      historicalSignals.push({
        date: d.date,
        type: 'sell',
        reason: '수익 실현 (BB 하단)',
        details: `주가(${d.close.toFixed(2)})가 BB하단(${d.bollingerBands.lower.toFixed(2)}) 도달.`
      });
    }
  });
  const uniqueSignals = new Map<string, TradingSignal>();
  historicalSignals.forEach(signal => {
    if (signal.startDate) {
      const key = `${signal.startDate}-${signal.reason}`;
      uniqueSignals.set(key, signal);
    }
  });
  const filteredSignals = [ ...historicalSignals.filter(s => !s.startDate), ...Array.from(uniqueSignals.values())];
  const finalSignals = filteredSignals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latestSignal = finalSignals.length > 0 ? finalSignals[finalSignals.length - 1] : null;
  if (!latestSignal || new Date(latestSignal.date).getTime() !== new Date(data[data.length - 1].date).getTime()) {
    finalSignals.push({
      date: data[data.length - 1].date, type: 'hold', reason: '관망 (중립 구간)',
      details: '현재 명확한 매수/매도 신호가 없습니다.'
    });
  }
  return finalSignals;
};
