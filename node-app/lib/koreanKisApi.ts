/* /lib/koreanKisApi.ts */
import axios, { AxiosRequestConfig } from "axios";
import { StockDataPoint } from "./stockUtils";
import stockConfig from "./stock.json";

const KIS_API_URL = "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

// 미국 주식과 완벽하게 공유되는 Global Token Cache
const globalKisToken = global as typeof globalThis & {
  kisAccessToken?: string | null;
  kisTokenExpiresAt?: number | null;
  kisTokenPromise?: Promise<string> | null;
};

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
  url: string,
  options: AxiosRequestConfig,
  retries: number = 3,
  delayMs: number = 1000,
) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios(url, options);
      return response;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (i === retries - 1) throw error;

        if (status === 500 || status === 429 || !status) {
          const waitTime = delayMs * (i + 1);
          console.log(`[INFO] Waiting ${waitTime}ms before retrying...`);
          await sleep(waitTime);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  throw new Error("API request failed after retries");
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (
    globalKisToken.kisAccessToken &&
    globalKisToken.kisTokenExpiresAt &&
    now < globalKisToken.kisTokenExpiresAt
  ) {
    return globalKisToken.kisAccessToken;
  }

  if (globalKisToken.kisTokenPromise) {
    console.log("[INFO] Waiting for shared KIS token promise (KR)...");
    return globalKisToken.kisTokenPromise;
  }

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }

  globalKisToken.kisTokenPromise = (async () => {
    try {
      const response = await fetchWithRetry(`${KIS_API_URL}/oauth2/tokenP`, {
        method: "POST",
        data: {
          grant_type: "client_credentials",
          appkey: KIS_APP_KEY,
          appsecret: KIS_APP_SECRET,
        },
      });

      globalKisToken.kisAccessToken = response.data.access_token;
      globalKisToken.kisTokenExpiresAt =
        Date.now() + (response.data.expires_in - 60) * 1000;

      console.log(
        "[INFO] Shared KIS Access Token has been issued successfully.",
      );
      return globalKisToken.kisAccessToken!;
    } catch (error) {
      console.error("[ERROR] Failed to get KIS access token:", error);
      throw new Error("Failed to get KIS access token");
    } finally {
      globalKisToken.kisTokenPromise = null;
    }
  })();

  return globalKisToken.kisTokenPromise;
}

async function getDailyKrStockDataInternal(
  ticker: string,
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  let startDateStr = "20240101";
  if (stopTimestamp > 0) {
    const sd = new Date(stopTimestamp);
    startDateStr = `${sd.getFullYear()}${String(sd.getMonth() + 1).padStart(2, "0")}${String(sd.getDate()).padStart(2, "0")}`;
  }

  try {
    const response = await fetchWithRetry(
      `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
      {
        method: "GET",
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
          FID_INPUT_DATE_1: startDateStr,
          FID_INPUT_DATE_2: todayStr,
          FID_PERIOD_DIV_CODE: "D",
          FID_ORG_ADJ_PRC: "0",
        },
      },
    );

    if (response.data.rt_cd !== "0") {
      throw new Error(response.data.msg1);
    }

    const output = response.data.output || [];
    const chunk = output.map((item: KisKrStockItem) => ({
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
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.k_stocks.find((t) => t.ticker === ticker);
  if (!stockInfo)
    throw new Error(`Ticker ${ticker} not in k_stocks in stock.json`);
  return getDailyKrStockDataInternal(stockInfo.ticker, stopTimestamp);
}

export const getDailyKoreanStockData = getDailyKrStockData;

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
    const bucketM = gap === 60 ? 0 : Math.floor(m / gap) * gap;

    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hhStr = String(h).padStart(2, "0");
    const mmStr = String(bucketM).padStart(2, "0");

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
      currentBucket.high = Math.max(currentBucket.high, item.high);
      currentBucket.low = Math.min(currentBucket.low, item.low);
      currentBucket.close = item.close;
      currentBucket.volume += item.volume;
    }
  }

  if (currentBucket) {
    aggregated.push({ ...currentBucket });
  }

  return aggregated;
}

export async function getMinuteKrStockData(
  ticker: string,
  gap: number = 15,
  maxPages: number = 60,
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.k_stocks.find((t) => t.ticker === ticker);
  if (!stockInfo)
    throw new Error(`Ticker ${ticker} not in k_stocks in stock.json`);

  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];

  let continueFetching = true;
  let pageCount = 0;

  let currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let currentHour = "153000";

  while (continueFetching && pageCount < maxPages) {
    try {
      const response = await fetchWithRetry(
        `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "FHKST03010230",
            custtype: "P",
          },
          params: {
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: ticker,
            FID_INPUT_DATE_1: currentDate,
            FID_INPUT_HOUR_1: currentHour,
            FID_PW_DATA_INCU_YN: "Y",
            FID_FAKE_TICK_INCU_YN: "",
          },
        },
      );

      if (response.data.rt_cd !== "0") {
        throw new Error(response.data.msg1);
      }

      const output2 = response.data.output2 || [];
      if (output2.length === 0) break;

      const chunk = output2
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

      const lastItem = output2[output2.length - 1];
      const lastItemMs = new Date(
        `${lastItem.stck_bsop_date.substring(0, 4)}-${lastItem.stck_bsop_date.substring(4, 6)}-${lastItem.stck_bsop_date.substring(6, 8)}T${lastItem.stck_cntg_hour.substring(0, 2)}:${lastItem.stck_cntg_hour.substring(2, 4)}:${lastItem.stck_cntg_hour.substring(4, 6)}`,
      ).getTime();

      if (lastItemMs <= stopTimestamp || output2.length < 50) {
        continueFetching = false;
      } else {
        currentDate = lastItem.stck_bsop_date;
        currentHour = lastItem.stck_cntg_hour;
      }

      pageCount++;

      if (continueFetching) {
        await sleep(200);
      }
    } catch (error) {
      console.error(
        `[ERROR] Pagination failed for ${ticker} at page ${pageCount}:`,
        error,
      );
      continueFetching = false;
    }
  }

  const sortedRawData = Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return aggregateCandles(sortedRawData, gap);
}

export const getMinuteKoreanStockData = getMinuteKrStockData;
