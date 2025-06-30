/* lib/stockUtils.ts */

export interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number; /* RSI 값 추가 */
  /* ohlc는 더 이상 필요 없으므로 삭제합니다. */
}

/* 각 티커별 데이터, 로딩 상태, 에러 상태를 관리하기 위한 타입 */
export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
}

/* RSI 계산 함수 */
export const calculateRSI = (data: StockDataPoint[], period: number = 14): StockDataPoint[] => {
  if (data.length === 0) return [];

  const rsiData = [...data]; /* 원본 데이터 복사 */
  let avgGain = 0;
  let avgLoss = 0;

  /* 초기 평균 Gain/Loss 계산 */
  /* RSI 계산을 위해 최소 period + 1 개의 데이터가 필요 */
  if (rsiData.length <= period) {
    return rsiData.map(d => ({ ...d, rsi: undefined })); /* 데이터 부족 시 RSI 없음 */
  }

  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) {
      avgGain += diff;
    } else {
      avgLoss += Math.abs(diff);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  /* 첫 RSI 값 계산 */
  let rs = avgLoss === 0 ? (avgGain > 0 ? Infinity : 0) : avgGain / avgLoss;
  rsiData[period].rsi = 100 - (100 / (1 + rs));

  /* 이후 RSI 값 계산 */
  for (let i = period + 1; i < rsiData.length; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    let gain = 0;
    let loss = 0;

    if (diff > 0) {
      gain = diff;
    } else {
      loss = Math.abs(diff);
    }

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    rs = avgLoss === 0 ? (avgGain > 0 ? Infinity : 0) : avgGain / avgLoss;
    rsiData[i].rsi = 100 - (100 / (1 + rs));
  }

  return rsiData;
};
