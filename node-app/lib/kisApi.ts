/* /lib/kisApi.ts */
import axios from "axios";
import { StockDataPoint } from "./stockUtils";
import stockConfig from "./stock.json";

const KIS_API_URL = "https://openapi.koreainvestment.com:9443";
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

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
  evol: string; // Update: Field name for volume in minute chart is 'evol'
  xhms: string; // Update: Field name for time is 'xhms'
  xymd: string; // Update: Field name for date is 'xymd'
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

    console.log("KIS Access Token has been issued successfully.");
    return accessToken!;
  } catch (error) {
    console.error("Failed to get KIS access token:", error);
    throw new Error("Failed to get KIS access token");
  }
}

async function getDailyOverseasStockData(
  ticker: string,
  exchange: string,
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
      EXCD: exchange.toUpperCase(), // [FIX] Ensure exchange code is uppercase
      SYMB: ticker,
      GUBN: "0",
      BYMD: currentBymd,
      MODP: "1",
    }).toString();

    try {
      const response = await axios.get(
        `${KIS_API_URL}/uapi/overseas-price/v1/quotations/dailyprice?${params}`,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "HHDFS76240000",
            custtype: "P", // [FIX] Add customer type header (P = Personal)
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

      if (chunk.length === 0) {
        continueFetching = false;
        break;
      }
      allData.push(...chunk);

      const lastDate = new Date(chunk[chunk.length - 1].date);
      if (lastDate <= twoYearsAgo) {
        continueFetching = false;
      } else {
        lastDate.setDate(lastDate.getDate() - 1);
        currentBymd = lastDate.toISOString().slice(0, 10).replace(/-/g, "");
      }
    } catch (error) {
      console.error(`Error fetching daily data for ${ticker}:`, error);
      throw error;
    }
  }

  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getDailyStockData(
  ticker: string,
): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.us_stocks.find(
    (t) => t.ticker.toUpperCase() === ticker.toUpperCase(),
  );
  if (!stockInfo) throw new Error(`Ticker ${ticker} not in stock.json`);
  return getDailyOverseasStockData(stockInfo.ticker, stockInfo.exchange);
}

export async function getMinuteStockData(
  ticker: string,
  gap: number = 15,
  maxPages: number = 10, // Default to fetch up to 10 pages (~1200 records)
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

  console.log(`Starting pagination to fetch minute data for ${ticker}`);

  while (continueFetching && pageCount < maxPages) {
    const params = new URLSearchParams({
      AUTH: "",
      EXCD: stockInfo.exchange.toUpperCase(), // Ensure exchange code is uppercase
      SYMB: ticker,
      NMIN: gap.toString(),
      PINC: "1", // Set to "1" to include previous day's data
      NEXT: currentNext,
      NREC: "120",
      FILL: "",
      KEYB: currentKeyb,
    }).toString();

    try {
      const response = await axios.get(
        `${KIS_API_URL}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice?${params}`,
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET,
            tr_id: "HHDFS76950200", // Corrected TR_ID for overseas minute chart
            custtype: "P", // Add customer type header (P = Personal)
          },
        },
      );

      if (response.data.rt_cd !== "0") {
        console.error(`[KIS API Error] ${ticker}: ${response.data.msg1}`);
        throw new Error(response.data.msg1);
      }

      const output2 = response.data.output2 || [];
      if (output2.length === 0) {
        break;
      }

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

      if (chunk.length === 0) {
        continueFetching = false;
        break;
      }

      allData.push(...chunk);

      // Check if there is more data to fetch based on KIS API rules
      if (output2.length < 120) {
        continueFetching = false;
      } else {
        currentNext = "1"; // Update NEXT to 1 for subsequent requests
        const lastItem = output2[output2.length - 1];
        currentKeyb = lastItem.xymd + lastItem.xhms; // Update KEYB with the last item's date and time
      }

      pageCount++;

      // Delay to avoid hitting API rate limits
      if (continueFetching) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(
        `Error fetching minute data for ${ticker} on page ${pageCount}:`,
        error,
      );
      throw error;
    }
  }

  console.log(
    `Completed fetching minute data for ${ticker}, total pages: ${pageCount}, total records: ${allData.length}`,
  );

  // Deduplicate and sort data
  return Array.from(
    new Map(allData.map((item) => [item.date, item])).values(),
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
