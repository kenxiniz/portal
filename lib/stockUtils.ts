/* lib/stockUtils.ts */

export interface StockDataPoint {
  date: string; /* यार-MM-dd 형식의 문자열 */
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

/* 수익률, 평균가 등 추가 정보를 담을 수 있도록 인터페이스 확장 */
export interface TradingSignal {
  date: string;
  startDate?: string;
  type: 'buy' | 'sell' | 'inverse-buy' | 'hold';
  reason: string;
  details?: string;
  entryPrice?: number; /* [수정] 진입 가격으로 이름 변경 */
  profitRate?: number; /* 수익률 */
  realizedPrice?: number; /* 수익 실현 가격 */
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


/*
 *  * [수정] 전체 매매 신호 분석 로직을 상태 기반(초기화 포함)으로 재구성합니다.
 *   */
export const analyzeAllTradingSignals = (data: StockDataPoint[]): TradingSignal[] => {
  if (data.length === 0) return [];

  const signals: TradingSignal[] = [];
  let lastBuySignal: TradingSignal | null = null;
  let lastInverseBuySignal: TradingSignal | null = null;

  /* 쌍바닥 찾기 상태 변수 */
  let firstTrough: StockDataPoint | null = null;
  let firstTroughIndex: number | null = null;
  let troughRsiState: 'initial' | 'crossed_30' | 'dipped' = 'initial';

  /* 쌍봉 찾기 상태 변수 */
  let firstPeak: StockDataPoint | null = null;
  let firstPeakIndex: number | null = null;
  let peakRsiState: 'initial' | 'crossed_70' | 'rallied' = 'initial';


  for (let i = 1; i < data.length; i++) { /* 0번째 인덱스는 전일 데이터가 없으므로 1부터 시작 */
    const currentPoint = data[i];
    const prevPoint = data[i - 1];

    /* --- 쌍바닥 (매수) 신호 로직 --- */
    if (!firstTrough) {
      if (prevPoint.rsi! < 30 && currentPoint.rsi! > prevPoint.rsi!) {
        firstTrough = prevPoint;
        firstTroughIndex = i - 1;
        troughRsiState = 'initial';
      }
    } else {
      const daysSinceFirstTrough = i - firstTroughIndex!;
      if (currentPoint.rsi! < firstTrough.rsi!) {
        firstTrough = null;
        firstTroughIndex = null;
        troughRsiState = 'initial';
      }
      else if (daysSinceFirstTrough > 90) {
        firstTrough = null;
        firstTroughIndex = null;
        troughRsiState = 'initial';
      } else if (daysSinceFirstTrough > 5) {
        if (troughRsiState === 'initial' && currentPoint.rsi! > 30) {
          troughRsiState = 'crossed_30';
        } else if (troughRsiState === 'crossed_30' && currentPoint.rsi! < prevPoint.rsi!) {
          troughRsiState = 'dipped';
        } else if (troughRsiState === 'dipped' && currentPoint.rsi! > prevPoint.rsi!) {
          if (currentPoint.close < firstTrough.close && currentPoint.rsi! > firstTrough.rsi!) {
            const buySignal: TradingSignal = {
              date: currentPoint.date,
              startDate: firstTrough.date,
              type: 'buy',
              reason: '매수 (RSI 쌍바닥)',
              entryPrice: currentPoint.close,
              details: `RSI 상승 다이버전스`
            };
            signals.push(buySignal);
            lastBuySignal = buySignal;
            firstTrough = null;
            firstTroughIndex = null;
            troughRsiState = 'initial';
          } else {
            troughRsiState = 'dipped';
          }
        }
      }
    }

    /* ---
     * 쌍봉
     * (인버스
     * 매수)
     * 신호
     * 로직
     * ---
     *  */
    if (!firstPeak) {
      if (prevPoint.rsi! > 70 && currentPoint.rsi! < prevPoint.rsi!) {
        firstPeak = prevPoint;
        firstPeakIndex = i - 1;
        peakRsiState = 'initial';
      }
    } else {
      const daysSinceFirstPeak = i - firstPeakIndex!;
      if (currentPoint.rsi! > firstPeak.rsi!) {
        firstPeak = null;
        firstPeakIndex = null;
        peakRsiState = 'initial';
      }
      else if (daysSinceFirstPeak > 90) {
        firstPeak = null;
        firstPeakIndex = null;
        peakRsiState = 'initial';
      } else if (daysSinceFirstPeak > 5) {
        if (peakRsiState === 'initial' && currentPoint.rsi! < 70) {
          peakRsiState = 'crossed_70';
        } else if (peakRsiState === 'crossed_70' && currentPoint.rsi! > prevPoint.rsi!) {
          peakRsiState = 'rallied';
        } else if (peakRsiState === 'rallied' && currentPoint.rsi! < prevPoint.rsi!) {
          if (currentPoint.close > firstPeak.close && currentPoint.rsi! < firstPeak.rsi!) {
            const inverseBuySignal: TradingSignal = {
date: currentPoint.date,
      startDate: firstPeak.date,
      type: 'inverse-buy',
      reason: '인버스 매수 (RSI 쌍봉)',
      entryPrice: currentPoint.close,
      details: `RSI 하락 다이버전스`
            };
            signals.push(inverseBuySignal);
            lastInverseBuySignal = inverseBuySignal;
            firstPeak = null;
            firstPeakIndex = null;
            peakRsiState = 'initial';
          } else {
            peakRsiState = 'rallied';
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
/* [수정]
 * details에
 * BB
 * 상단
 * 가격을
 * 추가합니다.
 * */
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
/* [수정]
 * details에
 * BB
 * 하단
 * 가격을
 * 추가합니다.
 * */
details: `BB하단: ${currentPoint.bollingerBands.lower.toFixed(2)}`
});
lastInverseBuySignal = null;
}
}
}

/* 중복 신호 제거 및 최종 정리 */
const uniqueSignals = Array.from(new Map(signals.map(s => [`${s.date}-${s.reason}`, s])).values());

/* 마지막 날짜에 유의미한 신호가 없으면 '관망' 추가 */
if (data.length > 0) {
  const lastSignalDate = uniqueSignals.length > 0 ? uniqueSignals[uniqueSignals.length - 1].date : null;
  if (lastSignalDate !== data[data.length - 1].date) {
    uniqueSignals.push({
date: data[data.length - 1].date,
type: 'hold',
reason: '관망 (중립 구간)',
});
}
}


return uniqueSignals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };
