/* /app/api/kStock/[ticker]/route.ts */

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
import { getDailyKoreanStockData } from "../../../../lib/koreanKisApi";
import { TickerAdvice } from "../../../../lib/models/advice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[];
  advice: AdviceObject | null;
};

type CacheEntry = {
  fetchDate: string;
  timestamp: number;
  payload: CachePayload;
};

const globalCache = global as typeof globalThis & {
  kStockApiCache: Map<string, CacheEntry>;
};

const apiCache = globalCache.kStockApiCache || new Map<string, CacheEntry>();
if (process.env.NODE_ENV !== "production") {
  globalCache.kStockApiCache = apiCache;
}

const getTodayKST = () => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset).toISOString().split("T")[0];
};

const parseSafeDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  if (dateStr.includes("-") || dateStr.includes("T")) return new Date(dateStr);

  if (/^\d{8}$/.test(dateStr)) {
    return new Date(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
    );
  }

  if (/^\d{14}$/.test(dateStr)) {
    return new Date(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}Z`,
    );
  }

  return new Date(dateStr);
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();

  const timeframe = url.searchParams.get("timeframe") || "1d";
  const forceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const cacheKey = `${ticker}-${timeframe}`;
  const todayStr = getTodayKST();

  try {
    await connectDB();

    console.log(`\n========== DEBUG [${ticker}] START ==========`);
    console.log(
      `[DEBUG 1] Attempting to fetch advice for ticker: '${ticker}' from DB...`,
    );

    // --- Step 1: Fetch Advice from DB ---
    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;

    const latestAdvice = adviceDoc?.advice || null;

    console.log(
      `[DEBUG 2] DB Query Result -> adviceDoc exists? ${!!adviceDoc}`,
    );
    console.log(
      `[DEBUG 3] Extracted latestAdvice ->`,
      latestAdvice ? "Found valid advice object" : "NULL",
    );

    if (latestAdvice) {
      console.log(
        `[DEBUG 3-1] Advice snippet:`,
        JSON.stringify(latestAdvice).substring(0, 100) + "...",
      );
    }

    // --- Step 2: Check In-Memory Cache ---
    if (!forceRefresh && apiCache.has(cacheKey)) {
      const cachedData = apiCache.get(cacheKey)!;
      const isToday = cachedData.fetchDate === todayStr;
      const isIntradayFresh =
        timeframe === "1d" ||
        Date.now() - cachedData.timestamp < 1000 * 60 * 15;

      if (isToday && isIntradayFresh) {
        console.log(
          `[DEBUG 4] Cache HIT. Injecting latestAdvice into cached payload.`,
        );
        cachedData.payload.advice = latestAdvice as AdviceObject | null;
        console.log(`========== DEBUG [${ticker}] END ==========\n`);
        return NextResponse.json(cachedData.payload);
      }
    }

    console.log(`[DEBUG 5] Cache MISS or expired. Fetching candles...`);

    // --- Step 3: Check Database for Candles ---
    let dbData = await getCandles("KR", ticker, timeframe, 500, forceRefresh);
    const fromDB = dbData && dbData.length > 0;

    if (fromDB) {
      console.log(`[DEBUG 6] Candles fetched from DB.`);
    }

    // --- Step 4: Fetch from KIS API ---
    if (forceRefresh || !fromDB) {
      console.log(`[DEBUG 7] Syncing ${timeframe} candles from KIS API...`);
      let apiData: StockDataPoint[] = [];

      if (timeframe === "1d") {
        apiData = await getDailyKoreanStockData(ticker);
      } else {
        console.warn(
          `[${ticker}] Intraday for KR stock is not yet implemented. Assuming 1d for now or returning empty.`,
        );
      }

      if (apiData && apiData.length > 0) {
        const formattedCandles = apiData.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));
        await saveCandlesBulk("KR", ticker, timeframe, formattedCandles);
        dbData = await getCandles("KR", ticker, timeframe, 500, true);
      }
    }

    // --- Step 5: Transform & Calculate Indicators ---
    if (dbData && dbData.length > 0) {
      const sortedData = [...dbData].sort(
        (a, b) =>
          parseSafeDate(a.timestamp).getTime() -
          parseSafeDate(b.timestamp).getTime(),
      );

      const mappedData = sortedData.map((c) => {
        const dateObj = parseSafeDate(c.timestamp);
        let dateString = c.timestamp;
        try {
          dateString =
            timeframe === "1d"
              ? dateObj.toISOString().split("T")[0]
              : dateObj.toISOString().replace("Z", "").replace("T", " ");
        } catch {
          // fallback
        }

        return {
          date: dateString,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        };
      });

      const processedData = calculateBollingerBands(calculateRSI(mappedData));
      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
      );

      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null,
      };

      apiCache.set(cacheKey, {
        fetchDate: todayStr,
        timestamp: Date.now(),
        payload: responsePayload,
      });

      console.log(
        `[DEBUG 8] Fresh data generated. Payload advice exists? ${!!responsePayload.advice}`,
      );
      console.log(`========== DEBUG [${ticker}] END ==========\n`);
      return NextResponse.json(responsePayload);
    }

    console.log(`========== DEBUG [${ticker}] END (No Data) ==========\n`);
    return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[K-Stock API Route - ${ticker}] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
