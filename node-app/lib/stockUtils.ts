/* lib/stockUtils.ts */

// --- Interfaces ---

export interface StockDataPoint {
  date: string; // YYYY-MM-DD 또는 YYYY-MM-DD HH:mm:ss
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

/**
 * RSI (Relative Strength Index) 계산
 * 데이터의 인덱스 밀림을 방지하기 위해 입력 배열과 동일한 길이를 반환합니다.
 */
export const calculateRSI = (
  data: StockDataPoint[],
  period: number = 14,
): StockDataPoint[] => {
  if (data.length === 0) return [];

  // 1. 모든 데이터 포인트에 rsi 필드를 undefined로 초기화하여 원본 구조 유지
  const rsiData = data.map((item) => ({
    ...item,
    rsi: undefined as number | undefined,
  }));

  if (data.length <= period) return rsiData;

  let avgGain = 0;
  let avgLoss = 0;

  // 2. 초기 평균 상승/하락분 계산
  for (let i = 1; i <= period; i++) {
    const diff = rsiData[i].close - rsiData[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }

  avgGain /= period;
  avgLoss /= period;

  // 3. 첫 번째 RSI 값 할당
  if (rsiData[period]) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiData[period].rsi = 100 - 100 / (1 + rs);
  }

  // 4. Wilder's Smoothing 방식 적용
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

/**
 * Bollinger Bands 계산 함수 수정
 * TypeScript 타입 추론 오류를 해결하기 위해 초기화 시 명시적 타입을 지정합니다.
 */
export const calculateBollingerBands = (
  data: StockDataPoint[],
  period: number = 20,
  stdDev: number = 2,
): StockDataPoint[] => {
  // [FIX] 초기화 시 bollingerBands의 타입을 명시적으로 지정하여 나중에 객체 할당이 가능하게 합니다.
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

    // 이제 정상적으로 할당이 가능합니다.
    bbData[i].bollingerBands = {
      middle: middle,
      upper: middle + standardDeviation * stdDev,
      lower: middle - standardDeviation * stdDev,
    };
  }
  return bbData;
};

// --- Signal Analysis ---

/**
 * RSI 다이버전스 및 볼린저 밴드 기반 매매 신호 분석
 */
export const analyzeAllTradingSignals = (
  data: StockDataPoint[],
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

  // 인덱스 1부터 시작하여 이전 봉과 비교
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

    /* --- 매수 신호 로직 (RSI 상승 다이버전스) --- */
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
        if (firstTroughIndex === null) {
          firstTrough = null;
          continue;
        }
        const daysSinceFirstTrough = i - firstTroughIndex;

        // RSI가 첫 번째 저점보다 낮아지면 다이버전스 무효화
        if (currentPoint.rsi < firstTrough.rsi!) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 90) {
          firstTrough = null;
          firstTroughIndex = null;
        } else if (daysSinceFirstTrough > 5) {
          // 가격은 낮아지는데 RSI는 높아지는 경우 (상승 다이버전스 조건)
          if (
            currentPoint.close < firstTrough.close &&
            currentPoint.rsi > firstTrough.rsi!
          ) {
            potentialSecondTrough = currentPoint;
          }
        }
      }
    }

    /* --- 인버스 매수 신호 로직 (RSI 하락 다이버전스) --- */
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
        if (firstPeakIndex === null) {
          firstPeak = null;
          continue;
        }
        const daysSinceFirstPeak = i - firstPeakIndex;

        // RSI가 첫 번째 고점보다 높아지면 다이버전스 무효화
        if (currentPoint.rsi > firstPeak.rsi!) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 90) {
          firstPeak = null;
          firstPeakIndex = null;
        } else if (daysSinceFirstPeak > 5) {
          // 가격은 높아지는데 RSI는 낮아지는 경우 (하락 다이버전스 조건)
          if (
            currentPoint.close > firstPeak.close &&
            currentPoint.rsi < firstPeak.rsi!
          ) {
            potentialSecondPeak = currentPoint;
          }
        }
      }
    }

    /* --- 수익 실현 (Sell) 신호 로직 --- */
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

  // 중복 제거 및 최종 정렬
  const uniqueSignalsMap = new Map<string, TradingSignal>();
  signals.forEach((s) => {
    uniqueSignalsMap.set(`${s.date}-${s.reason}`, s);
  });

  const uniqueSignals = Array.from(uniqueSignalsMap.values());

  // 마지막 날짜에 신호가 없으면 '관망' 신호 추가
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
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
};
