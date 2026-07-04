/* /app/api/futures/[ticker]/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/mongodb";
import { getCandles, saveCandlesBulk } from "../../../../lib/candle/service";
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "../../../../lib/stockUtils";
import { TickerAdvice } from "../../../../lib/models/advice";
import stockConfig from "../../../../lib/stock.json";
import { getCacheData, setCacheData } from "../../../../lib/cache";
import { getFuturesAccessToken } from "../../../../lib/kisApi";

interface FuturesConfigItem {
  ticker: string;
  name?: string;
  exchange: string;
}

/**
 * Derive the product code (품목코드) from a full futures ticker symbol.
 * e.g. "NQU26" → "NQ", "ESZ25" → "ES", "GCQ25" → "GC"
 * The product code is the leading alphabetic characters before the month/year suffix.
 */
function getProductCode(ticker: string): string {
  const match = ticker.match(/^([A-Z]+)/);
  return match ? match[1] : ticker;
}

/**
 * Look up the exchange code for the given full ticker symbol from stock.json.
 * Falls back to "CME" if not configured.
 */
function getExchangeCode(ticker: string): string {
  const productCode = getProductCode(ticker);
  const config = (stockConfig.futures as FuturesConfigItem[]).find(
    (f) => f.ticker === productCode,
  );
  return config?.exchange ?? "CME";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[];
  advice: AdviceObject | null;
};

interface StockConfigItem {
  ticker: string;
  isInverse?: boolean;
}

interface KisFuturesDailyItem {
  data_date: string;
  open_price: string;
  high_price: string;
  low_price: string;
  last_price: string;
  vol?: string;
}

interface KisFuturesMinuteItem {
  data_date: string;
  data_time: string;
  open_price: string;
  high_price: string;
  low_price: string;
  last_price: string;
  vol?: string;
}

const KIS_API_BASE_URL =
  process.env.KIS_API_BASE_URL || "https://openapi.koreainvestment.com:9443";

// ============================================================================
// KIS Futures API Fetcher Functions
// ============================================================================
async function fetchFuturesDailyData(
  ticker: string,
): Promise<StockDataPoint[]> {
  const token = await getFuturesAccessToken();
  const url = `${KIS_API_BASE_URL}/uapi/overseas-futureoption/v1/quotations/daily-ccnl`;

  // API 문서 기준 (해외선물-018 / HHDFC55020100):
  // - ITEM_CD 파라미터 없음 (SRS_CD만 사용)
  // - QRY_TP: "Q" (최초조회), QRY_GAP: "" (일간에서는 미사용), INDEX_KEY: "" (최초조회 공백)
  // - CLOSE_DATE_TIME: 오늘 날짜 (YYYYMMDD), START_DATE_TIME: ""
  // - QRY_CNT: 최대 40
  const todayStr = new Date()
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
    .split(".")
    .map((s) => s.trim().padStart(2, "0"))
    .slice(0, 3)
    .join("");

  const exchCd = getExchangeCode(ticker);
  console.log(`[INFO] [${ticker}] Daily fetch — EXCH_CD: ${exchCd}`);

  const query = new URLSearchParams({
    SRS_CD: ticker,
    EXCH_CD: exchCd,
    START_DATE_TIME: "",
    CLOSE_DATE_TIME: todayStr,
    QRY_TP: "Q",
    QRY_CNT: "40",
    QRY_GAP: "",
    INDEX_KEY: "",
  }).toString();

  const response = await fetch(`${url}?${query}`, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_FUTURES_KEY || "",
      appsecret: process.env.KIS_FUTURES_SECRET || "",
      tr_id: "HHDFC55020100",
      custtype: "P",
    },
    cache: "no-store",
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    // KIS API occasionally returns malformed JSON (unquoted keys).
    const msgMatch = responseText.match(/"msg1"\s*:\s*"([^"]+)"/);
    const fallbackMsg = msgMatch ? msgMatch[1] : responseText.substring(0, 200);
    throw new Error(`KIS Futures API error: ${fallbackMsg}`);
  }

  if (!response.ok || data.rt_cd !== "0") {
    const exchCd = getExchangeCode(ticker);
    throw new Error(
      `KIS Futures API error [EXCH_CD:${exchCd}]: ${data.msg1 || responseText}`,
    );
  }

  // 일간 API: output1이 메타(ret_cnt 등), output2가 캔들 배열
  let dataList: KisFuturesDailyItem[] = [];
  if (Array.isArray(data.output2)) {
    dataList = data.output2;
  }

  if (dataList.length === 0) return [];

  return dataList
    .map((item: KisFuturesDailyItem) => {
      const yyyy = item.data_date.substring(0, 4);
      const mm = item.data_date.substring(4, 6);
      const dd = item.data_date.substring(6, 8);

      return {
        date: `${yyyy}-${mm}-${dd}`,
        open: parseFloat(item.open_price),
        high: parseFloat(item.high_price),
        low: parseFloat(item.low_price),
        close: parseFloat(item.last_price),
        volume: parseFloat(item.vol || "0"),
      };
    })
    .filter((d) => !isNaN(d.close) && d.close > 0)
    .reverse();
}

async function fetchFuturesMinuteData(
  ticker: string,
  timeframe: string,
): Promise<StockDataPoint[]> {
  const token = await getFuturesAccessToken();
  const url = `${KIS_API_BASE_URL}/uapi/overseas-futureoption/v1/quotations/inquire-time-futurechartprice`;

  // API 문서 기준 (해외선물-016 / HHDFC55020400):
  // - ITEM_CD 파라미터 없음 (SRS_CD만 사용)
  // - QRY_TP: "Q" (최초조회), INDEX_KEY: "" (최초조회 공백)
  // - QRY_GAP: 분 간격 (5, 15, 60 등)
  // - CLOSE_DATE_TIME: YYYYMMDD (오늘 날짜), START_DATE_TIME: ""
  // - 응답: output1이 캔들 배열, output2가 메타(ret_cnt, index_key 등)
  const todayStr = new Date()
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
    .split(".")
    .map((s) => s.trim().padStart(2, "0"))
    .slice(0, 3)
    .join("");

  const qryGap = timeframe === "1h" ? "60" : timeframe === "15m" ? "15" : "5";

  const exchCd = getExchangeCode(ticker);
  console.log(
    `[INFO] [${ticker}] Minute fetch — EXCH_CD: ${exchCd}, QRY_GAP: ${qryGap}`,
  );

  const query = new URLSearchParams({
    SRS_CD: ticker,
    EXCH_CD: exchCd,
    START_DATE_TIME: "",
    CLOSE_DATE_TIME: todayStr,
    QRY_TP: "Q",
    QRY_CNT: "120",
    QRY_GAP: qryGap,
    INDEX_KEY: "",
  }).toString();

  const response = await fetch(`${url}?${query}`, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_FUTURES_KEY || "",
      appsecret: process.env.KIS_FUTURES_SECRET || "",
      tr_id: "HHDFC55020400",
      custtype: "P",
    },
    cache: "no-store",
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    const msgMatch = responseText.match(/"msg1"\s*:\s*"([^"]+)"/);
    const fallbackMsg = msgMatch ? msgMatch[1] : responseText.substring(0, 200);
    throw new Error(`KIS Futures API error: ${fallbackMsg}`);
  }

  if (!response.ok || data.rt_cd !== "0") {
    const exchCd = getExchangeCode(ticker);
    throw new Error(
      `KIS Futures API error [EXCH_CD:${exchCd}]: ${data.msg1 || responseText}`,
    );
  }

  // 분봉 API: output1이 캔들 배열, output2가 메타(ret_cnt, index_key 등)
  let dataList: KisFuturesMinuteItem[] = [];
  if (Array.isArray(data.output1)) {
    dataList = data.output1;
  }

  if (dataList.length === 0) return [];

  return dataList
    .map((item: KisFuturesMinuteItem) => {
      const dateStr = item.data_date || "";
      const timeStr = item.data_time || "000000";

      const yyyy = dateStr.substring(0, 4);
      const mm = dateStr.substring(4, 6);
      const dd = dateStr.substring(6, 8);
      const hh = timeStr.substring(0, 2);
      const min = timeStr.substring(2, 4);
      const ss = timeStr.substring(4, 6);

      return {
        date: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
        open: parseFloat(item.open_price),
        high: parseFloat(item.high_price),
        low: parseFloat(item.low_price),
        close: parseFloat(item.last_price),
        volume: parseFloat(item.vol || "0"),
      };
    })
    .filter((d) => !isNaN(d.close) && d.close > 0)
    .reverse();
}

// ============================================================================
// MAIN GET ROUTE
// ============================================================================
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const isForceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const cacheKey = `kisFutures:${ticker}:${timeframe}`;
  const MARKET_TYPE = "FUTURES";

  try {
    await connectDB();

    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const latestAdvice = adviceDoc?.advice || null;

    if (!isForceRefresh) {
      const cachedPayload = (await getCacheData(
        cacheKey,
      )) as CachePayload | null;

      if (cachedPayload) {
        console.log(
          `[INFO] [${ticker}] Shared Memory Cache HIT for ${timeframe}`,
        );
        cachedPayload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedPayload);
      }

      console.log(
        `[WARN] [${ticker}] Shared Memory Cache MISS for ${timeframe}. Actively executing sync pipeline.`,
      );
    }

    console.log(
      `[INFO] [${ticker}] Fetching fresh data from external KIS API for ${timeframe}.`,
    );

    const rawDbData = await getCandles(
      MARKET_TYPE,
      ticker,
      timeframe,
      1500,
      false,
    );
    const dbMap = new Map();

    if (rawDbData && rawDbData.length > 0) {
      for (const c of rawDbData) {
        dbMap.set(new Date(c.timestamp).getTime(), c);
      }
    }

    const uniqueDbCandles = Array.from(dbMap.values()).sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let latestDbTimestamp = 0;
    if (uniqueDbCandles.length > 0) {
      latestDbTimestamp = new Date(
        uniqueDbCandles[uniqueDbCandles.length - 1].timestamp,
      ).getTime();
    }

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const isMissingMoreThanOneWeek =
      uniqueDbCandles.length === 0 ||
      (latestDbTimestamp > 0 && now - latestDbTimestamp > oneWeekMs);

    if (isMissingMoreThanOneWeek) {
      console.log(
        `[WARN] [${ticker}] Missing > 1 week data. Force fetching full history.`,
      );
    }

    let apiData: StockDataPoint[] = [];
    try {
      if (timeframe === "1d") {
        apiData = await fetchFuturesDailyData(ticker);
      } else {
        apiData = await fetchFuturesMinuteData(ticker, timeframe);
      }
    } catch (apiErr) {
      console.error(`[ERROR] Futures API Error for ${ticker}:`, apiErr);
    }

    if (apiData && apiData.length > 0) {
      const newDataToSave = apiData.filter((candle) => {
        const apiTime = new Date(candle.date).getTime();
        if (apiTime < latestDbTimestamp) return false;

        const existingDbCandle = uniqueDbCandles.find(
          (c) => new Date(c.timestamp).getTime() === apiTime,
        );

        if (!existingDbCandle) return true;

        return (
          existingDbCandle.close !== candle.close ||
          existingDbCandle.high !== candle.high ||
          existingDbCandle.low !== candle.low ||
          existingDbCandle.volume !== candle.volume
        );
      });

      if (newDataToSave.length > 0) {
        console.log(
          `[INFO] [${ticker}] Upserting ${newDataToSave.length} records to DB...`,
        );

        const formattedCandles = newDataToSave.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));

        await saveCandlesBulk(MARKET_TYPE, ticker, timeframe, formattedCandles);
      }
    }

    const finalMap = new Map();
    for (const c of uniqueDbCandles) {
      finalMap.set(new Date(c.timestamp).getTime(), c);
    }

    if (apiData && apiData.length > 0) {
      for (const c of apiData) {
        finalMap.set(new Date(c.date).getTime(), {
          timestamp: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        });
      }
    }

    const finalData = Array.from(finalMap.values());
    if (finalData.length > 0) {
      const sortedData = finalData
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .slice(-500);

      const mappedData = sortedData.map((c) => ({
        date:
          timeframe === "1d"
            ? new Date(c.timestamp).toISOString().split("T")[0]
            : new Date(c.timestamp)
                .toISOString()
                .replace("Z", "")
                .replace("T", " "),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const processedData = calculateBollingerBands(calculateRSI(mappedData));

      const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
        (s) => s.ticker === ticker,
      );
      const isInverse = !!usStock?.isInverse;

      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
        isInverse,
      );

      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null,
      };

      console.log(
        `[INFO] [${ticker}] Hydrating shared memory cache for ${timeframe}`,
      );
      await setCacheData(cacheKey, responsePayload);

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[ERROR] Futures API Route - ${ticker}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
