/* /app/api/binance/[symbol]/route.ts */

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
import { getCacheData, setCacheData } from "../../../../lib/cache";
import { getBinanceFuturesData } from "../../../../lib/binanceApi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CachePayload = {
  data: StockDataPoint[];
  signals: TradingSignal[];
  advice: AdviceObject | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.pathname.split("/").pop();
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const isForceRefresh = url.searchParams.get("refresh") === "true";

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const cacheKey = `binance:${symbol}:${timeframe}`;
  const MARKET_TYPE = "BINANCE";

  try {
    await connectDB();

    const adviceDoc = (await TickerAdvice.findOne({
      ticker: symbol,
    }).lean()) as {
      advice?: object;
    } | null;
    const latestAdvice = adviceDoc?.advice || null;

    if (!isForceRefresh) {
      const cachedPayload = (await getCacheData(
        cacheKey,
      )) as CachePayload | null;

      if (cachedPayload) {
        console.log(`[INFO] [${symbol}] Cache HIT for ${timeframe}`);
        cachedPayload.advice = latestAdvice as AdviceObject | null;
        return NextResponse.json(cachedPayload);
      }

      console.log(`[WARN] [${symbol}] Cache MISS for ${timeframe}`);
    }

    console.log(
      `[INFO] [${symbol}] Fetching fresh data from Binance API for ${timeframe}`,
    );

    const rawDbData = await getCandles(
      MARKET_TYPE,
      symbol,
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
        `[WARN] [${symbol}] Missing > 1 week data. Force fetching full history.`,
      );
    }

    let apiData: StockDataPoint[] = [];
    try {
      apiData = await getBinanceFuturesData(symbol, timeframe, 500);
    } catch (apiErr) {
      console.error(`[ERROR] Binance API Error for ${symbol}:`, apiErr);
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
          `[INFO] [${symbol}] Upserting ${newDataToSave.length} records to DB...`,
        );

        const formattedCandles = newDataToSave.map((candle) => ({
          timestamp: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }));

        await saveCandlesBulk(MARKET_TYPE, symbol, timeframe, formattedCandles);
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
                .replace("T", " ")
                .substring(0, 19),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const processedData = calculateBollingerBands(calculateRSI(mappedData));

      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
        false, // Binance는 inverse 없음
      );

      console.log(
        `[INFO] [${symbol}] ${timeframe} signals generated:`,
        signals.length,
        signals
          .slice(0, 3)
          .map((s) => ({ type: s.type, date: s.date, startDate: s.startDate })),
      );

      const responsePayload: CachePayload = {
        data: processedData,
        signals,
        advice: latestAdvice as AdviceObject | null,
      };

      console.log(`[INFO] [${symbol}] Hydrating cache for ${timeframe}`);
      await setCacheData(cacheKey, responsePayload);

      return NextResponse.json(responsePayload);
    }

    return NextResponse.json({ data: [], signals: [], advice: latestAdvice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[ERROR] Binance API Route - ${symbol}:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
