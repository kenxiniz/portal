/* lib/charts/indicators.ts */
import { Time, BusinessDay } from "lightweight-charts";

// --- Generic Indicator Math Functions ---

export const calculateRSI = <T extends { close: number; rsi?: number }>(
  data: T[],
  period: number = 14,
): T[] => {
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

export const calculateBollingerBands = <
  T extends {
    close: number;
    bollingerBands?: { middle: number; upper: number; lower: number };
  },
>(
  data: T[],
  period: number = 20,
  stdDev: number = 2,
): T[] => {
  const bbData = data.map((item) => ({
    ...item,
    bollingerBands: undefined as T["bollingerBands"],
  }));

  if (data.length < period) return bbData;

  for (let i = period - 1; i < bbData.length; i++) {
    const slice = bbData.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, val) => acc + val.close, 0);
    const middle = sum / period;
    const variance =
      slice.reduce((acc, val) => acc + Math.pow(val.close - middle, 2), 0) /
      period;
    const sd = Math.sqrt(variance);

    bbData[i].bollingerBands = {
      middle,
      upper: middle + sd * stdDev,
      lower: middle - sd * stdDev,
    };
  }
  return bbData;
};

export const calculateKAMA = (
  closePrices: number[],
  period: number = 10,
  fastEnd: number = 2,
  slowEnd: number = 30,
): (number | null)[] => {
  const kama: (number | null)[] = new Array(closePrices.length).fill(null);
  if (closePrices.length < period) return kama;

  const fastest = 2 / (fastEnd + 1);
  const slowest = 2 / (slowEnd + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += closePrices[i];
  kama[period - 1] = sum / period;

  for (let i = period; i < closePrices.length; i++) {
    const change = Math.abs(closePrices[i] - closePrices[i - period]);
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(closePrices[i - j] - closePrices[i - j - 1]);
    }
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
    kama[i] =
      (kama[i - 1] as number) + sc * (closePrices[i] - (kama[i - 1] as number));
  }
  return kama;
};

export const calculateVWAP = <
  T extends {
    date?: string;
    chartTime?: Time;
    high: number;
    low: number;
    close: number;
    volume?: number | string;
  },
>(
  data: T[],
  timeframe: string,
): (number | null)[] => {
  const vwap: (number | null)[] = new Array(data.length).fill(null);
  const isIntraday = timeframe === "1h" || timeframe === "15m";

  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;
  let currentAnchorKey = "";

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    let dateStr = "";

    if (candle.date) {
      dateStr = candle.date;
    } else if (candle.chartTime !== undefined) {
      if (typeof candle.chartTime === "number") {
        dateStr = new Date(candle.chartTime * 1000).toISOString();
      } else if (typeof candle.chartTime === "string") {
        dateStr = candle.chartTime;
      } else {
        const bd = candle.chartTime as BusinessDay;
        dateStr = `${bd.year}-${String(bd.month).padStart(2, "0")}-${String(bd.day).padStart(2, "0")}`;
      }
    } else {
      continue;
    }

    const datePart = dateStr.includes("T")
      ? dateStr.split("T")[0]
      : dateStr.split(" ")[0];
    const yearStr = datePart.substring(0, 4);

    let shouldReset = false;
    if (isIntraday) {
      shouldReset = datePart !== currentAnchorKey;
      if (shouldReset) currentAnchorKey = datePart;
    } else {
      shouldReset = yearStr !== currentAnchorKey;
      if (shouldReset) currentAnchorKey = yearStr;
    }

    if (shouldReset) {
      cumulativeTypicalVolume = 0;
      cumulativeVolume = 0;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const vol = Number(candle.volume) || 1;

    cumulativeTypicalVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    vwap[i] =
      cumulativeVolume === 0
        ? candle.close
        : cumulativeTypicalVolume / cumulativeVolume;
  }
  return vwap;
};

export const calculateEMA = (
  data: number[],
  period: number,
): (number | null)[] => {
  const ema: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return ema;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let previousEma = sum / period;
  ema[period - 1] = previousEma;

  for (let i = period; i < data.length; i++) {
    previousEma = (data[i] - previousEma) * k + previousEma;
    ema[i] = previousEma;
  }
  return ema;
};

export const calculateMacdKama = (closePrices: number[]) => {
  const fastKAMA = calculateKAMA(closePrices, 12);
  const slowKAMA = calculateKAMA(closePrices, 26);

  const macdLineRaw: (number | null)[] = closePrices.map((_, i) => {
    if (fastKAMA[i] !== null && slowKAMA[i] !== null) {
      return (fastKAMA[i] as number) - (slowKAMA[i] as number);
    }
    return null;
  });

  const signalLineRaw: (number | null)[] = new Array(closePrices.length).fill(
    null,
  );
  const macdStartIndex = 25;

  if (closePrices.length >= macdStartIndex + 9) {
    let sum = 0;
    for (let i = macdStartIndex; i < macdStartIndex + 9; i++) {
      sum += macdLineRaw[i] as number;
    }
    signalLineRaw[macdStartIndex + 9 - 1] = sum / 9;

    const k = 2 / (9 + 1);
    for (let i = macdStartIndex + 9; i < closePrices.length; i++) {
      signalLineRaw[i] =
        ((macdLineRaw[i] as number) - (signalLineRaw[i - 1] as number)) * k +
        (signalLineRaw[i - 1] as number);
    }
  }

  const histogramRaw: (number | null)[] = macdLineRaw.map((macd, i) => {
    const sig = signalLineRaw[i];
    return macd !== null && sig !== null ? macd - sig : null;
  });

  return { macdLineRaw, signalLineRaw, histogramRaw };
};

export const getMacdStatus = (
  macdLineRaw: (number | null)[],
  signalLineRaw: (number | null)[],
) => {
  let title = "MACD";
  let color = "#2e7d32";
  let value = 0;

  const lastIdx = macdLineRaw.length - 1;
  const prevIdx = lastIdx - 1;

  if (
    lastIdx > 0 &&
    macdLineRaw[lastIdx] !== null &&
    signalLineRaw[lastIdx] !== null &&
    macdLineRaw[prevIdx] !== null &&
    signalLineRaw[prevIdx] !== null
  ) {
    const currMacd = macdLineRaw[lastIdx] as number;
    value = currMacd;
    const currSig = signalLineRaw[lastIdx] as number;
    const prevMacd = macdLineRaw[prevIdx] as number;
    const prevSig = signalLineRaw[prevIdx] as number;

    if (prevMacd <= prevSig && currMacd > currSig) {
      title = "Gold";
      color = "#2e7d32";
    } else if (prevMacd >= prevSig && currMacd < currSig) {
      title = "Dead";
      color = "#ef5350";
    } else if (currMacd > currSig) {
      title = "Up";
      color = "#2e7d32";
    } else if (currMacd < currSig) {
      title = "Down";
      color = "#ef5350";
    }
  }
  return { title, color, value };
};

export const calculateProbabilityLevels = (closePrices: number[]) => {
  const lookbackPeriod = Math.min(1000, closePrices.length);
  if (lookbackPeriod <= 10) return [];

  const recentPrices = closePrices.slice(-lookbackPeriod);
  const mean = recentPrices.reduce((a, b) => a + b, 0) / lookbackPeriod;
  const variance =
    recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    lookbackPeriod;
  const sd = Math.sqrt(variance);

  return [
    { price: mean + 1.645 * sd, title: "90%", color: "rgba(239, 83, 80, 0.8)" },
    { price: mean + 1.15 * sd, title: "75%", color: "rgba(239, 83, 80, 0.8)" },
    { price: mean + 0.67 * sd, title: "50%", color: "rgba(239, 83, 80, 0.8)" },
    { price: mean, title: "Mean", color: "rgba(204, 204, 204, 0.5)" },
    { price: mean - 0.67 * sd, title: "50%", color: "rgba(38, 166, 154, 0.8)" },
    { price: mean - 1.15 * sd, title: "75%", color: "rgba(38, 166, 154, 0.8)" },
    {
      price: mean - 1.645 * sd,
      title: "90%",
      color: "rgba(38, 166, 154, 0.8)",
    },
  ];
};

export interface TrendBox {
  startTime: Time;
  endTime: Time;
  topPrice: number;
  bottomPrice: number;
  isUptrend: boolean;
  prices: number[];
}

export function getGaussianWeights(period: number, sigma: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(weight);
    sum += weight;
  }
  return weights.map((w) => w / sum);
}

export const calculateGaussianLine = (
  data: number[],
  period: number = 20,
  sigma: number = 3,
): (number | null)[] => {
  if (!data || data.length < period) return new Array(data.length).fill(null);

  const weights = getGaussianWeights(period, sigma);
  const gaussianLine: (number | null)[] = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j] * weights[j];
    }
    gaussianLine[i] = sum;
  }
  return gaussianLine;
};

export const calculateGaussianTrendBoxes = (
  data: { time: Time; close: number; high: number; low: number }[],
  period: number = 20,
  sigma: number = 3,
): TrendBox[] => {
  if (!data || data.length < period) return [];

  const closePrices = data.map((d) => d.close);
  const gaussianLine = calculateGaussianLine(closePrices, period, sigma);

  const boxes: TrendBox[] = [];
  let currentBox: Partial<TrendBox> = { prices: [] };

  for (let i = period; i < data.length; i++) {
    const prevGauss = gaussianLine[i - 1];
    const currGauss = gaussianLine[i];

    if (prevGauss === null || currGauss === null) continue;

    const isUptrend = currGauss > prevGauss;

    if (currentBox.startTime === undefined) {
      currentBox = {
        startTime: data[i - 1].time,
        topPrice: Math.max(data[i - 1].high, data[i].high),
        bottomPrice: Math.min(data[i - 1].low, data[i].low),
        isUptrend,
        prices: [data[i - 1].close, data[i].close],
      };
    } else {
      currentBox.topPrice = Math.max(
        currentBox.topPrice as number,
        data[i].high,
      );
      currentBox.bottomPrice = Math.min(
        currentBox.bottomPrice as number,
        data[i].low,
      );
      currentBox.endTime = data[i].time;
      currentBox.prices!.push(data[i].close);

      if (currentBox.isUptrend !== isUptrend) {
        boxes.push(currentBox as TrendBox);
        currentBox = {
          startTime: data[i].time,
          topPrice: data[i].high,
          bottomPrice: data[i].low,
          isUptrend,
          prices: [data[i].close],
        };
      }
    }
  }

  if (currentBox.startTime !== undefined) {
    currentBox.endTime = data[data.length - 1].time;
    boxes.push(currentBox as TrendBox);
  }

  return boxes;
};

// --- Extracted Indicator Status Functions for Strategy Isolation ---

export interface TrendStatus {
  isUp: boolean;
  isDown: boolean;
  isGold?: boolean;
  isDead?: boolean;
}

export const calculateKamaTrend = (
  kamaData: (number | null)[],
  closePrices: number[],
): TrendStatus[] => {
  return kamaData.map((k, i) => {
    if (i === 0 || k === null || kamaData[i - 1] === null) {
      return { isUp: false, isDown: false, isGold: false, isDead: false };
    }
    const pk = kamaData[i - 1] as number;
    const currentClose = closePrices[i];
    const prevClose = closePrices[i - 1];

    return {
      isUp: k > pk,
      isDown: k < pk,
      isGold: prevClose <= pk && currentClose > k,
      isDead: prevClose >= pk && currentClose < k,
    };
  });
};

export const calculateGaussianTrend = (
  gaussianData: (number | null)[],
): TrendStatus[] => {
  return gaussianData.map((g, i) => {
    if (i === 0 || g === null || gaussianData[i - 1] === null) {
      return { isUp: false, isDown: false };
    }
    const pg = gaussianData[i - 1] as number;
    return {
      isUp: g > pg,
      isDown: g < pg,
    };
  });
};

// --- [추가] VWAP Retest Algorithm ---
export interface VwapRetestStatus {
  isBullishRetest: boolean;
  isBearishRetest: boolean;
}

export const calculateVwapRetest = (
  closePrices: number[],
  highPrices: number[],
  lowPrices: number[],
  vwap: (number | null)[],
): VwapRetestStatus[] => {
  const status: VwapRetestStatus[] = new Array(closePrices.length).fill({
    isBullishRetest: false,
    isBearishRetest: false,
  });
  let consecutiveAbove = 0;
  let consecutiveBelow = 0;

  for (let i = 0; i < closePrices.length; i++) {
    const c = closePrices[i];
    const h = highPrices[i];
    const l = lowPrices[i];
    const v = vwap[i];

    let isBullishRetest = false;
    let isBearishRetest = false;

    if (v !== null) {
      // 1. 카운팅 규칙: 종가가 VWAP 위에 있으면 유지, 아래로 깨지면 즉시 리셋
      if (c > v) {
        consecutiveAbove++;
        consecutiveBelow = 0;
      } else if (c < v) {
        consecutiveBelow++;
        consecutiveAbove = 0;
      } else {
        // VWAP과 종가가 완전히 동일한 경우 (안전을 위해 리셋)
        consecutiveAbove = 0;
        consecutiveBelow = 0;
      }

      // 2. 리테스트 조건 확정
      // 5봉 이상 안착 성공 상태 + 꼬리로 VWAP 터치(low <= v) + 종가는 VWAP 방어 성공(c > v)
      if (consecutiveAbove >= 5 && l <= v && c > v) {
        isBullishRetest = true;
      }

      // 5봉 이상 하락 안착 상태 + 꼬리로 VWAP 터치(high >= v) + 종가는 저항 방어 성공(c < v)
      if (consecutiveBelow >= 5 && h >= v && c < v) {
        isBearishRetest = true;
      }
    }

    status[i] = { isBullishRetest, isBearishRetest };
  }
  return status;
};
