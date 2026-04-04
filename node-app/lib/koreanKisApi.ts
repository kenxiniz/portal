/* /lib/koreanKisApi.ts */
import axios from "axios";
import { StockDataPoint } from "./stockUtils";
import stockConfig from "./stock.json";

const KIS_API_URL = "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

// Interfaces for KR Stock
interface KisKrStockItem {
  stck_bsop_date: string;
  stck_oprc: string;
  stck_hgpr: string;
  stck_lwpr: string;
  stck_clpr: string;
  acml_vol: string;
}

interface KisKrMinuteStockItem {
  stck_bsop_date: string;
  stck_cntg_hour: string;
  stck_oprc: string;
  stck_hgpr: string;
  stck_lwpr: string;
  stck_prpr: string;
  cntg_vol: string;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
    return accessToken;
  }

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }

  try {
    const response = await axios.post(`${KIS_API_URL}/oauth2/tokenP`, {
      grant_type: "client_credentials",
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    });

    accessToken = response.data.access_token;
    tokenExpiresAt = now + (response.data.expires_in - 60) * 1000;

    console.log("[INFO] KIS Access Token for KR market has been issued.");
    return accessToken!;
  } catch (error) {
    console.error("[ERROR] Failed to get KIS access token:", error);
    throw new Error("Failed to get KIS access token");
  }
}

async function getDailyKrStockDataInternal(
  ticker: string,
): Promise<StockDataPoint[]> {
  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  try {
    const response = await axios.get(
      `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
          appkey: KIS_APP_KEY,
          appsecret: KIS_APP_SECRET,
          tr_id: "FHKST01010400",
          custtype: "P",
        },
        params: {
          FID_COND_MRKT_DIV_CODE: "J",
          FID_INPUT_ISCD: ticker,
          FID_INPUT_DATE_1: "20240101",
          FID_INPUT_DATE_2: todayStr,
          FID_PERIOD_DIV_CODE: "D",
          FID_ORG_ADJ_PRC: "0",
        },
      },
    );

    if (response.data.rt_cd !== "0") throw new Error(response.data.msg1);

    const output2 = response.data.output2 || [];
    const chunk = output2.map((item: KisKrStockItem) => ({
      date: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`,
      open: parseFloat(item.stck_oprc),
      high: parseFloat(item.stck_hgpr),
      low: parseFloat(item.stck_lwpr),
      close: parseFloat(item.stck_clpr),
      volume: parseFloat(item.acml_vol),
    }));

    allData.push(...chunk);
  } catch (error) {
    console.error(`[ERROR] Fetching KR daily data for ${ticker}:`, error);
    throw error;
  }

  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getDailyKrStockData(
  ticker: string,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.k_stocks.find((t) => t.ticker === ticker);
  if (!stockInfo)
    throw new Error(`Ticker ${ticker} not in k_stocks in stock.json`);
  return getDailyKrStockDataInternal(stockInfo.ticker);
}

export const getDailyKoreanStockData = getDailyKrStockData;

/**
 * Helper to aggregate 1-minute candles into requested timeframe (15m or 60m)
 */
function aggregateCandles(
  data: StockDataPoint[],
  gap: number,
): StockDataPoint[] {
  const aggregated: StockDataPoint[] = [];
  let currentBucket: StockDataPoint | null = null;
  let currentBucketKey = "";

  for (const item of data) {
    const dateObj = new Date(item.date);
    const h = dateObj.getHours();
    const m = dateObj.getMinutes();

    // Determine the minute bucket (e.g., 0, 15, 30, 45 for gap=15)
    const bucketM = gap === 60 ? 0 : Math.floor(m / gap) * gap;

    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hhStr = String(h).padStart(2, "0");
    const mmStr = String(bucketM).padStart(2, "0");

    // Create a precise key representing this time block
    const bucketKey = `${yyyy}-${mm}-${dd}T${hhStr}:${mmStr}:00`;

    if (currentBucketKey !== bucketKey) {
      if (currentBucket) {
        aggregated.push({ ...currentBucket });
      }
      currentBucketKey = bucketKey;
      currentBucket = {
        date: bucketKey,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      };
    } else if (currentBucket) {
      // Expand the candle
      currentBucket.high = Math.max(currentBucket.high, item.high);
      currentBucket.low = Math.min(currentBucket.low, item.low);
      currentBucket.close = item.close; // Last close wins
      currentBucket.volume += item.volume;
    }
  }

  // Push the final bucket
  if (currentBucket) {
    aggregated.push({ ...currentBucket });
  }

  return aggregated;
}

export async function getMinuteKrStockData(
  ticker: string,
  gap: number = 15,
  maxPages: number = 60, // 60 pages * 120 items = ~7200 minutes (enough to form 1h/15m charts)
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.k_stocks.find((t) => t.ticker === ticker);
  if (!stockInfo)
    throw new Error(`Ticker ${ticker} not in k_stocks in stock.json`);

  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];

  let continueFetching = true;
  let pageCount = 0;

  // Start fetching from today's closing time
  let currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let currentHour = "153000";
  let lastFirstKey = "";

  console.log(
    `[INFO] [${ticker}] Fetching raw 1m data to aggregate into ${gap}m candles using FHKST03010230...`,
  );

  while (continueFetching && pageCount < maxPages) {
    try {
      const response = await axios.get(
        `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice`,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "FHKST03010230", // Using Daily Minute Chart API
            custtype: "P",
          },
          params: {
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: ticker,
            FID_INPUT_DATE_1: currentDate, // Required for this API
            FID_INPUT_HOUR_1: currentHour, // Required for this API
            FID_PW_DATA_INCU_YN: "Y",
            FID_FAKE_TICK_INCU_YN: "", // Space/Blank required by doc
          },
        },
      );

      if (response.data.rt_cd !== "0") {
        throw new Error(response.data.msg1);
      }

      const output2 = response.data.output2 || [];
      if (output2.length === 0) {
        break;
      }

      // Loop prevention: KIS API sometimes repeats the last chunk if no more data
      const chunkFirstKey =
        output2[0].stck_bsop_date + output2[0].stck_cntg_hour;
      if (lastFirstKey === chunkFirstKey) {
        break;
      }
      lastFirstKey = chunkFirstKey;

      const chunk: StockDataPoint[] = output2
        .map((item: KisKrMinuteStockItem) => ({
          date: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}T${item.stck_cntg_hour.substring(0, 2)}:${item.stck_cntg_hour.substring(2, 4)}:${item.stck_cntg_hour.substring(4, 6)}`,
          open: parseFloat(item.stck_oprc),
          high: parseFloat(item.stck_hgpr),
          low: parseFloat(item.stck_lwpr),
          close: parseFloat(item.stck_prpr),
          volume: parseFloat(item.cntg_vol),
        }))
        .filter((item: StockDataPoint) => !isNaN(item.close) && item.close > 0);

      allData.push(...chunk);

      // Pagination setup for next call
      const lastItem = output2[output2.length - 1];
      currentDate = lastItem.stck_bsop_date;
      currentHour = lastItem.stck_cntg_hour;

      pageCount++;

      // KIS usually returns 120 items per call. Stop if we get significantly less.
      if (output2.length < 50) {
        continueFetching = false;
      }

      // 100ms delay to prevent rate limiting
      if (continueFetching) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(
        `[ERROR] [${ticker}] Pagination failed at page ${pageCount}:`,
        error,
      );
      continueFetching = false;
    }
  }

  // 1. Deduplicate and sort the raw 1m data chronologically (oldest first)
  const sortedRawData = Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 2. Aggregate the massive 1-minute dataset into requested gaps (15m or 60m)
  const aggregatedData = aggregateCandles(sortedRawData, gap);

  console.log(
    `[INFO] [${ticker}] Aggregated ${sortedRawData.length} raw 1m candles into ${aggregatedData.length} ${gap}m candles.`,
  );

  return aggregatedData;
}

export const getMinuteKoreanStockData = getMinuteKrStockData;
