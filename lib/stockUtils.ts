/* lib/stockUtils.ts */

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

/* 신호(Signal) 타입에 날짜와 상세 정보를 추가합니다. */
export interface TradingSignal {
  date: string;
  type: 'buy' | 'sell' | 'inverse-buy' | 'hold';
  reason: string;
  details?: string;
}

export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
  /* signal을 배열로 변경하여 모든 과거 신호를 담도록 합니다. */
  signals: TradingSignal[]; 
}

export interface CachedStockData {
  lastFetch: string;
  data: StockDataPoint[];
  signals: TradingSignal[];
}

/* RSI 계산 함수 (변경 없음) */
export const calculateRSI = (data: StockDataPoint[], period: number = 14): StockDataPoint[] => {
  if (data.length <= period) return data;
  const rsiData = [...data];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  rsiData[period].rsi = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < rsiData.length; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    rsiData[i].rsi = 100 - (100 / (1 + rs));
  }
  return rsiData;
};

/* 볼린저 밴드 계산 함수 (변경 없음) */
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

/* 과거 데이터 전체를 분석하여 모든 신호를 찾는 함수 */
export const analyzeAllTradingSignals = (data: StockDataPoint[]): TradingSignal[] => {
  if (data.length < 30) return [];

  const signals: TradingSignal[] = [];

  /* 유의미한 저점(troughs)과 고점(peaks) 찾기 */
  const troughs = data.map((d, i) => {
    if (i === 0 || i === data.length - 1) return null;
    const prev = data[i - 1];
    const current = data[i];
    const next = data[i + 1];
    if (current.low < prev.low && current.low < next.low) return current;
    return null;
  }).filter(d => d !== null) as StockDataPoint[];

  const peaks = data.map((d, i) => {
    if (i === 0 || i === data.length - 1) return null;
    const prev = data[i - 1];
    const current = data[i];
    const next = data[i + 1];
    if (current.high > prev.high && current.high > next.high) return current;
    return null;
  }).filter(d => d !== null) as StockDataPoint[];

  /* 1. 인버스 매수 신호 (RSI 쌍봉) 탐색 */
  const highRSI70 = peaks.filter(p => p.rsi && p.rsi > 70);
  for (let i = 1; i < highRSI70.length; i++) {
    const prevPeak = highRSI70[i - 1];
    const lastPeak = highRSI70[i];
    if (lastPeak.high > prevPeak.high && lastPeak.rsi! < prevPeak.rsi!) {
      signals.push({
        date: lastPeak.date,
        type: 'inverse-buy',
        reason: '인버스 매수 신호 (RSI 쌍봉)',
        details: `주가는 전고점(${prevPeak.high.toFixed(2)})을 돌파했으나 RSI는 하락하는 약세 다이버전스 발생.`,
      });
    }
  }

  /* 2. 매수 신호 (RSI 쌍바닥) 탐색 */
  const lowRSI30 = troughs.filter(t => t.rsi && t.rsi < 30);
  for (let i = 1; i < lowRSI30.length; i++) {
    const prevTrough = lowRSI30[i - 1];
    const lastTrough = lowRSI30[i];
    if (lastTrough.low < prevTrough.low && lastTrough.rsi! > prevTrough.rsi!) {
      signals.push({
        date: lastTrough.date,
        type: 'buy',
        reason: '매수 신호 (RSI 쌍바닥)',
        details: `주가는 전저점(${prevTrough.low.toFixed(2)})보다 하락했으나 RSI는 상승하는 강세 다이버전스 발생.`,
      });
    }
  }

  /* 3. 수익 실현 신호 (볼린저 밴드) 탐색 */
  data.forEach(d => {
    if (d.bollingerBands && d.close >= d.bollingerBands.upper) {
      signals.push({
        date: d.date,
        type: 'sell',
        reason: '수익 실현 신호 (볼린저 밴드)',
        details: `주가(${d.close.toFixed(2)})가 볼린저 밴드 상단(${d.bollingerBands.upper.toFixed(2)})에 도달했습니다.`,
      });
    }
  });

  return signals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};
