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

// [트래픽 제어] KIS API 429 에러 방지를 위한 글로벌 신호등
const globalKisState = global as typeof globalThis & {
  kisLastRequestTime?: number;
  kisRequestQueuePromise?: Promise<void>;
};

const RATE_LIMIT_DELAY_MS = 70; // 초당 14회 제한 (KIS 초당 20회 제한 방어)

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

async function rateLimitedFetch(url: string, options: AxiosRequestConfig) {
  const prevPromise =
    globalKisState.kisRequestQueuePromise || Promise.resolve();

  let resolveNext: () => void;
  globalKisState.kisRequestQueuePromise = new Promise((resolve) => {
    resolveNext = resolve;
  });

  await prevPromise;

  const now = Date.now();
  const last = globalKisState.kisLastRequestTime || 0;
  const timeToWait = Math.max(0, RATE_LIMIT_DELAY_MS - (now - last));

  if (timeToWait > 0) {
    await sleep(timeToWait);
  }

  globalKisState.kisLastRequestTime = Date.now();
  resolveNext!();

  return axios(url, options);
}

async function fetchWithRetry(
  url: string,
  options: AxiosRequestConfig,
  retries: number = 3,
  delayMs: number = 500,
) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await rateLimitedFetch(url, options);
      return response;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (i === retries - 1) throw error;

        if (status === 500 || status === 429 || !status) {
          const waitTime = delayMs * (i + 1) + Math.floor(Math.random() * 200);
          console.log(
            `[WARN] Server Error/Rate Limit. Waiting ${waitTime}ms before retrying...`,
          );
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

  let startDateStr = "20200101";
  if (stopTimestamp > 0) {
    const sd = new Date(stopTimestamp);
    startDateStr = `${sd.getFullYear()}${String(sd.getMonth() + 1).padStart(2, "0")}${String(sd.getDate()).padStart(2, "0")}`;
  }

  let currentEndDateStr = todayStr;
  let continueFetching = true;
  let pageCount = 0;
  const maxPages = 30;

  console.log(`\n[DEBUG] [${ticker}] === DAILY FETCH STARTED ===`);
  console.log(
    `[DEBUG] [${ticker}] Target Stop Date: ${new Date(stopTimestamp).toISOString()}`,
  );

  while (continueFetching && pageCount < maxPages) {
    try {
      console.log(
        `[DEBUG] [${ticker}] (Daily) Page ${pageCount + 1} | Requesting Date_2 (End): ${currentEndDateStr}`,
      );

      const response = await fetchWithRetry(
        `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            // [핵심 버그 수정] FHKST01010400(최근30일) -> FHKST03010100(과거 기간별조회)로 변경!
            tr_id: "FHKST03010100",
            custtype: "P",
          },
          params: {
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: ticker,
            FID_INPUT_DATE_1: startDateStr,
            FID_INPUT_DATE_2: currentEndDateStr,
            FID_PERIOD_DIV_CODE: "D",
            FID_ORG_ADJ_PRC: "0",
          },
        },
      );

      if (response.data.rt_cd !== "0") {
        throw new Error(response.data.msg1);
      }

      // [핵심 버그 수정] 기간별조회(FHKST03010100)는 데이터를 output2 배열에 반환합니다.
      const output = response.data.output2 || [];
      console.log(
        `[DEBUG] [${ticker}] (Daily) Page ${pageCount + 1} | API Returned: ${output.length} items`,
      );

      if (output.length === 0) {
        console.log(
          `[DEBUG] [${ticker}] (Daily) Stopping: API returned 0 items.`,
        );
        break;
      }

      const chunk = output
        .filter((item: KisKrStockItem) => item.stck_bsop_date)
        .map((item: KisKrStockItem) => ({
          date: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`,
          open: parseFloat(item.stck_oprc),
          high: parseFloat(item.stck_hgpr),
          low: parseFloat(item.stck_lwpr),
          close: parseFloat(item.stck_clpr),
          volume: parseFloat(item.acml_vol),
        }));

      allData.push(...chunk);
      console.log(
        `[DEBUG] [${ticker}] (Daily) Total accumulated so far: ${allData.length}`,
      );

      // 기간별조회 API는 한 번에 100개씩 던져줍니다. 50개 미만이면 상장일 도달 등 더 이상 과거가 없는 것입니다.
      if (output.length < 50) {
        console.log(
          `[DEBUG] [${ticker}] (Daily) Stopping: API returned less than 50 items. Reached end of available history.`,
        );
        break;
      }

      const lastItem = output[output.length - 1];
      const oldestDateStr = lastItem.stck_bsop_date;
      const oldestDateMs = new Date(
        `${oldestDateStr.substring(0, 4)}-${oldestDateStr.substring(4, 6)}-${oldestDateStr.substring(6, 8)}`,
      ).getTime();

      if (oldestDateMs <= stopTimestamp) {
        console.log(
          `[DEBUG] [${ticker}] (Daily) Stopping: Reached target stopTimestamp (${new Date(stopTimestamp).toISOString()}).`,
        );
        continueFetching = false;
      } else {
        const nextEndDate = new Date(oldestDateMs - 24 * 60 * 60 * 1000);
        currentEndDateStr = `${nextEndDate.getFullYear()}${String(nextEndDate.getMonth() + 1).padStart(2, "0")}${String(nextEndDate.getDate()).padStart(2, "0")}`;
      }

      pageCount++;
    } catch (error) {
      console.error(
        `[ERROR] Fetching KR daily data pagination failed for ${ticker}:`,
        error,
      );
      continueFetching = false;
    }
  }

  console.log(
    `[DEBUG] [${ticker}] === DAILY FETCH FINISHED | Total Final: ${allData.length} ===\n`,
  );

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

  console.log(`\n[DEBUG] [${ticker}] === MINUTE FETCH STARTED ===`);
  console.log(
    `[DEBUG] [${ticker}] Target Stop Date: ${new Date(stopTimestamp).toISOString()}`,
  );

  while (continueFetching && pageCount < maxPages) {
    try {
      console.log(
        `[DEBUG] [${ticker}] (Minute) Page ${pageCount + 1} | Requesting Date: ${currentDate}, Hour: ${currentHour}`,
      );

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
      console.log(
        `[DEBUG] [${ticker}] (Minute) Page ${pageCount + 1} | API Returned: ${output2.length} items`,
      );

      if (output2.length === 0) {
        console.log(
          `[DEBUG] [${ticker}] (Minute) Stopping: API returned 0 items.`,
        );
        break;
      }

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
      console.log(
        `[DEBUG] [${ticker}] (Minute) Total accumulated so far: ${allData.length}`,
      );

      if (output2.length < 30) {
        console.log(
          `[DEBUG] [${ticker}] (Minute) Stopping: API returned less than 30 items. Reached market open or end of available intraday history.`,
        );
        break;
      }

      const lastItem = output2[output2.length - 1];
      const lastItemMs = new Date(
        `${lastItem.stck_bsop_date.substring(0, 4)}-${lastItem.stck_bsop_date.substring(4, 6)}-${lastItem.stck_bsop_date.substring(6, 8)}T${lastItem.stck_cntg_hour.substring(0, 2)}:${lastItem.stck_cntg_hour.substring(2, 4)}:${lastItem.stck_cntg_hour.substring(4, 6)}`,
      ).getTime();

      if (lastItemMs <= stopTimestamp) {
        console.log(
          `[DEBUG] [${ticker}] (Minute) Stopping: Reached target stopTimestamp (${new Date(stopTimestamp).toISOString()}).`,
        );
        continueFetching = false;
      } else {
        currentDate = lastItem.stck_bsop_date;
        currentHour = lastItem.stck_cntg_hour;
      }

      pageCount++;
    } catch (error) {
      console.error(
        `[ERROR] Pagination failed for ${ticker} at page ${pageCount}:`,
        error,
      );
      continueFetching = false;
    }
  }

  console.log(
    `[DEBUG] [${ticker}] === MINUTE FETCH FINISHED | Total Final: ${allData.length} ===\n`,
  );

  const sortedRawData = Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return aggregateCandles(sortedRawData, gap);
}

export const getMinuteKoreanStockData = getMinuteKrStockData;
