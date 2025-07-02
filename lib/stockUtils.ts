/* lib/stockUtils.ts */

export interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number;
}

export interface TickerState {
  data: StockDataPoint[] | null;
  loading: boolean;
  error: string | null;
}

/* API Route에서 사용할 타입 */
export interface CachedStockData {
  lastFetch: string;
  data: StockDataPoint[];
}

/**
 *  * RSI 계산 함수
 *   * @param data StockDataPoint 배열
 *    * @param period RSI 기간 (기본값 14)
 *     * @returns RSI가 포함된 StockDataPoint 배열
 *      */
export const calculateRSI = (data: StockDataPoint[], period: number = 14): StockDataPoint[] => {
  if (data.length === 0) return [];

  const rsiData = [...data];
  let avgGain = 0;
  let avgLoss = 0;

  if (rsiData.length <= period) {
    return rsiData.map(d => ({ ...d, rsi: undefined }));
  }

  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i-1].close;
    if (diff > 0) {
      avgGain += diff;
    } else {
      avgLoss += Math.abs(diff);
    }
  }
  avgGain /= period;
  avgLoss /= period;

  let rs = avgLoss === 0 ? (avgGain > 0 ? Infinity : 0) : avgGain / avgLoss;
  rsiData[period].rsi = 100 - (100 / (1 + rs));

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
