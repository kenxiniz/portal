/* /lib/kisApi.ts */
import axios, { AxiosRequestConfig } from "axios";
import { StockDataPoint } from "./stockUtils";
import stockConfig from "./stock.json";

const KIS_API_URL = "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const KIS_FUTURES_KEY = process.env.KIS_FUTURES_KEY;
const KIS_FUTURES_SECRET = process.env.KIS_FUTURES_SECRET;

// 미국 주식과 한국 주식이 완벽하게 토큰을 공유하기 위한 Global Cache
const globalKisToken = global as typeof globalThis & {
  kisAccessToken?: string | null;
  kisTokenExpiresAt?: number | null;
  kisTokenPromise?: Promise<string> | null;
  // 해외선물 전용 토큰 캐시
  kisFuturesAccessToken?: string | null;
  kisFuturesTokenExpiresAt?: number | null;
  kisFuturesTokenPromise?: Promise<string> | null;
};

// Interfaces
interface KisStockItem {
  xymd: string;
  open: string;
  high: string;
  low: string;
  clos: string;
  tvol: string;
}

interface KisMinuteStockItem {
  last: string;
  open: string;
  high: string;
  low: string;
  evol: string;
  xhms: string;
  xymd: string;
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

export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // 1. 이미 유효한 토큰이 전역 캐시에 있으면 즉시 반환
  if (
    globalKisToken.kisAccessToken &&
    globalKisToken.kisTokenExpiresAt &&
    now < globalKisToken.kisTokenExpiresAt
  ) {
    return globalKisToken.kisAccessToken;
  }

  // 2. 다른 파일이나 프로세스에서 이미 토큰을 발급받고 있다면, 그 작업이 끝날 때까지 대기
  if (globalKisToken.kisTokenPromise) {
    console.log("[INFO] Waiting for shared KIS token promise (US)...");
    return globalKisToken.kisTokenPromise;
  }

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }

  // 3. 토큰 발급 시작 및 전역 Promise Lock 설정
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

export async function getFuturesAccessToken(): Promise<string> {
  const now = Date.now();

  // 1. 유효한 선물 전용 토큰이 캐시에 있으면 즉시 반환
  if (
    globalKisToken.kisFuturesAccessToken &&
    globalKisToken.kisFuturesTokenExpiresAt &&
    now < globalKisToken.kisFuturesTokenExpiresAt
  ) {
    return globalKisToken.kisFuturesAccessToken;
  }

  // 2. 이미 발급 중이면 해당 Promise 대기
  if (globalKisToken.kisFuturesTokenPromise) {
    console.log("[INFO] Waiting for shared KIS Futures token promise...");
    return globalKisToken.kisFuturesTokenPromise;
  }

  if (!KIS_FUTURES_KEY || !KIS_FUTURES_SECRET) {
    throw new Error(
      "KIS_FUTURES_KEY and KIS_FUTURES_SECRET must be set for futures API",
    );
  }

  // 3. 선물 전용 토큰 발급 시작
  globalKisToken.kisFuturesTokenPromise = (async () => {
    try {
      const response = await fetchWithRetry(`${KIS_API_URL}/oauth2/tokenP`, {
        method: "POST",
        data: {
          grant_type: "client_credentials",
          appkey: KIS_FUTURES_KEY,
          appsecret: KIS_FUTURES_SECRET,
        },
      });

      globalKisToken.kisFuturesAccessToken = response.data.access_token;
      globalKisToken.kisFuturesTokenExpiresAt =
        Date.now() + (response.data.expires_in - 60) * 1000;

      console.log(
        "[INFO] Shared KIS Futures Access Token has been issued successfully.",
      );
      return globalKisToken.kisFuturesAccessToken!;
    } catch (error) {
      console.error("[ERROR] Failed to get KIS Futures access token:", error);
      throw new Error("Failed to get KIS Futures access token");
    } finally {
      globalKisToken.kisFuturesTokenPromise = null;
    }
  })();

  return globalKisToken.kisFuturesTokenPromise;
}

async function getDailyOverseasStockData(
  ticker: string,
  exchange: string,
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];
  let currentBymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let continueFetching = true;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  while (continueFetching) {
    const params = new URLSearchParams({
      AUTH: "",
      EXCD: exchange.toUpperCase(),
      SYMB: ticker,
      GUBN: "0",
      BYMD: currentBymd,
      MODP: "1",
    }).toString();

    try {
      const response = await fetchWithRetry(
        `${KIS_API_URL}/uapi/overseas-price/v1/quotations/dailyprice?${params}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "HHDFS76240000",
            custtype: "P",
          },
        },
      );

      if (response.data.rt_cd !== "0") throw new Error(response.data.msg1);

      const chunk = response.data.output2.map((item: KisStockItem) => ({
        date: `${item.xymd.substring(0, 4)}-${item.xymd.substring(4, 6)}-${item.xymd.substring(6, 8)}`,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.clos),
        volume: parseFloat(item.tvol),
      }));

      if (chunk.length === 0) break;
      allData.push(...chunk);

      const lastDate = new Date(chunk[chunk.length - 1].date);

      if (lastDate <= twoYearsAgo || lastDate.getTime() <= stopTimestamp) {
        continueFetching = false;
      } else {
        lastDate.setDate(lastDate.getDate() - 1);
        currentBymd = lastDate.toISOString().slice(0, 10).replace(/-/g, "");
      }

      if (continueFetching) {
        await sleep(300);
      }
    } catch (error) {
      console.error(`[ERROR] Fetching daily data for ${ticker}:`, error);
      throw error;
    }
  }

  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getDailyStockData(
  ticker: string,
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.us_stocks.find(
    (t) => t.ticker.toUpperCase() === ticker.toUpperCase(),
  );
  if (!stockInfo) throw new Error(`Ticker ${ticker} not in stock.json`);
  return getDailyOverseasStockData(
    stockInfo.ticker,
    stockInfo.exchange,
    stopTimestamp,
  );
}

export async function getMinuteStockData(
  ticker: string,
  gap: number = 15,
  maxPages: number = 10,
  stopTimestamp: number = 0,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.us_stocks.find(
    (t) => t.ticker.toUpperCase() === ticker.toUpperCase(),
  );
  if (!stockInfo) throw new Error(`Ticker ${ticker} not in stock.json`);

  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];

  let continueFetching = true;
  let currentNext = "";
  let currentKeyb = "";
  let pageCount = 0;

  while (continueFetching && pageCount < maxPages) {
    const params = new URLSearchParams({
      AUTH: "",
      EXCD: stockInfo.exchange.toUpperCase(),
      SYMB: ticker,
      NMIN: gap.toString(),
      PINC: "1",
      NEXT: currentNext,
      NREC: "120",
      FILL: "",
      KEYB: currentKeyb,
    }).toString();

    try {
      const response = await fetchWithRetry(
        `${KIS_API_URL}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "HHDFS76950200",
            custtype: "P",
          },
        },
      );

      if (response.data.rt_cd !== "0") throw new Error(response.data.msg1);

      const output2 = response.data.output2 || [];
      if (output2.length === 0) break;

      const chunk: StockDataPoint[] = output2
        .map((item: KisMinuteStockItem) => ({
          date: `${item.xymd.substring(0, 4)}-${item.xymd.substring(4, 6)}-${item.xymd.substring(6, 8)}T${item.xhms.substring(0, 2)}:${item.xhms.substring(2, 4)}:${item.xhms.substring(4, 6)}`,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.last),
          volume: parseFloat(item.evol),
        }))
        .filter((item: StockDataPoint) => !isNaN(item.close) && item.close > 0);

      if (chunk.length === 0) break;
      allData.push(...chunk);

      const lastItemDate = new Date(chunk[chunk.length - 1].date).getTime();
      if (lastItemDate <= stopTimestamp || output2.length < 120) {
        continueFetching = false;
      } else {
        currentNext = "1";
        const lastItem = output2[output2.length - 1];
        currentKeyb = lastItem.xymd + lastItem.xhms;
      }

      pageCount++;

      if (continueFetching) {
        await sleep(200);
      }
    } catch (error) {
      console.error(
        `[ERROR] Fetching minute data for ${ticker} on page ${pageCount}:`,
        error,
      );
      throw error;
    }
  }

  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
