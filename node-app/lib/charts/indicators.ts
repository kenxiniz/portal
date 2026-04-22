/* lib/charts/indicators.ts */
import { Time } from "lightweight-charts";

// 1. KAMA (Kaufman's Adaptive Moving Average)
export const calculateKAMA = (
  data: number[],
  period: number,
  fastEnd = 2,
  slowEnd = 30,
): (number | null)[] => {
  const kama: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return kama;

  const fastest = 2 / (fastEnd + 1);
  const slowest = 2 / (slowEnd + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  kama[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    const change = Math.abs(data[i] - data[i - period]);
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(data[i - j] - data[i - j - 1]);
    }
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
    kama[i] =
      (kama[i - 1] as number) + sc * (data[i] - (kama[i - 1] as number));
  }
  return kama;
};

// 2. MACD Reloaded
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

// 3. MACD Real-time Status Tag
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

// 4. Probability Zone Levels (1,000 Candles)
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

// 5. Gaussian Filter and Trend Box Extraction
export interface TrendBox {
  startTime: Time;
  endTime: Time;
  topPrice: number;
  bottomPrice: number;
  isUptrend: boolean;
  prices: number[]; // Store close prices for statistical calculation
}

function getGaussianWeights(period: number, sigma: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(weight);
    sum += weight;
  }
  return weights.map((w) => w / sum);
}

export const calculateGaussianTrendBoxes = (
  data: { time: Time; close: number; high: number; low: number }[],
  period: number = 20,
  sigma: number = 3,
): TrendBox[] => {
  if (!data || data.length < period) return [];

  const weights = getGaussianWeights(period, sigma);
  const gaussianLine: (number | null)[] = new Array(data.length).fill(null);

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close * weights[j];
    }
    gaussianLine[i] = sum;
  }

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

// 6. Exponential Moving Average (EMA)
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

// 7. Volume Weighted Average Price (VWAP)
export const calculateVWAP = (
  data: {
    date?: string;
    chartTime?: Time;
    high: number;
    low: number;
    close: number;
    volume?: number | string;
  }[],
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
    } else if (candle.chartTime) {
      dateStr =
        typeof candle.chartTime === "number"
          ? new Date(candle.chartTime * 1000).toISOString()
          : String(candle.chartTime);
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
