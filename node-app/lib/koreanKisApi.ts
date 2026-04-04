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
  stck_bsop_date: string; // Date (YYYYMMDD)
  stck_oprc: string; // Open
  stck_hgpr: string; // High
  stck_lwpr: string; // Low
  stck_clpr: string; // Close
  acml_vol: string; // Volume
}

interface KisKrMinuteStockItem {
  stck_bsop_date: string; // Date
  stck_cntg_hour: string; // Time (HHMMSS)
  stck_oprc: string; // Open
  stck_hgpr: string; // High
  stck_lwpr: string; // Low
  stck_prpr: string; // Last (Current)
  cntg_vol: string; // Volume
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

export async function getMinuteKrStockData(
  ticker: string,
  gap: number = 15,
  maxPages: number = 12, // Increased to fetch enough history (approx 1200 records)
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.k_stocks.find((t) => t.ticker === ticker);
  if (!stockInfo)
    throw new Error(`Ticker ${ticker} not in k_stocks in stock.json`);

  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];

  let continueFetching = true;
  let pageCount = 0;
  let currentHour = ""; // Empty for the first request (latest data)

  console.log(
    `[INFO] [${ticker}] Starting pagination for KR intraday data (${gap}m)`,
  );

  while (continueFetching && pageCount < maxPages) {
    try {
      const response = await axios.get(
        `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice`,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "FHKST03010200",
            custtype: "P",
          },
          params: {
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: ticker,
            FID_INPUT_HOUR_1: currentHour,
            FID_ETC_CLS_CODE: gap.toString(),
            FID_PW_DATA_INCU_YN: "Y",
          },
        },
      );

      if (response.data.rt_cd !== "0") {
        throw new Error(response.data.msg1);
      }

      const output2 = response.data.output2 || [];
      if (output2.length === 0) {
        continueFetching = false;
        break;
      }

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

      // Pagination: Get the time of the last candle to fetch previous block
      const lastItem = output2[output2.length - 1];
      currentHour = lastItem.stck_cntg_hour;

      pageCount++;

      // If we got fewer than 100 items, we've reached the end of available history
      if (output2.length < 100) {
        continueFetching = false;
      }

      // Delay to respect API rate limits
      if (continueFetching) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(
        `[ERROR] [${ticker}] Pagination failed at page ${pageCount}:`,
        error,
      );
      continueFetching = false;
    }
  }

  console.log(
    `[INFO] [${ticker}] Completed fetching KR intraday. Total records: ${allData.length}`,
  );

  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export const getMinuteKoreanStockData = getMinuteKrStockData;
