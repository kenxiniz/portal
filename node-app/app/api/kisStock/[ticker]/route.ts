/* /app/api/kisStock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/mongodb";
import { getCandles, saveCandle } from "../../../../lib/candle/service";
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
  StockDataPoint,
} from "../../../../lib/stockUtils";
import { getDailyStockData, getMinuteStockData } from "../../../../lib/kisApi";
import mongoose from "mongoose";

// [NEW] Force Next.js to completely disable caching for this API route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Advice Schema (Independent from candles)
const AdviceSchema = new mongoose.Schema({
  ticker: { type: String, required: true, unique: true },
  advice: { type: Object, default: null },
  updatedAt: { type: Date, default: Date.now },
});
const TickerAdvice =
  mongoose.models.TickerAdvice || mongoose.model("TickerAdvice", AdviceSchema);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.pathname.split("/").pop();

  // Get query parameters
  const timeframe = url.searchParams.get("timeframe") || "1d";
  const forceRefresh = url.searchParams.get("refresh") === "true";

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  try {
    await connectDB();
    console.log(`[${ticker}] Request: ${timeframe}, Refresh: ${forceRefresh}`);

    // 1. Fetch AI Advice from DB
    const adviceDoc = (await TickerAdvice.findOne({ ticker }).lean()) as {
      advice?: object;
    } | null;
    const advice = adviceDoc?.advice || null;

    // 2. Try loading from MongoDB (Service handles internal memory cache)
    // Increase limit from 100 to 500 to show enough intraday bars
    let dbData = await getCandles("US", ticker, timeframe, 500, forceRefresh);

    // 3. Sync with KIS API if refresh requested or DB is empty
    if (forceRefresh || !dbData || dbData.length === 0) {
      console.log(`[${ticker}] Syncing ${timeframe} data from KIS API...`);

      let apiData: StockDataPoint[] = [];

      if (timeframe === "1d") {
        apiData = await getDailyStockData(ticker);
      } else {
        const gap = timeframe === "1h" ? 60 : 15;
        apiData = await getMinuteStockData(ticker, gap);
      }

      if (apiData && apiData.length > 0) {
        for (const candle of apiData) {
          await saveCandle("US", ticker, timeframe, {
            timestamp: candle.date,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          });
        }
        // Increase limit from 100 to 500 here as well
        dbData = await getCandles("US", ticker, timeframe, 500, true);
      }
    }

    if (dbData && dbData.length > 0) {
      // 4. Transform for Technical Analysis (ICandle -> StockDataPoint)
      const sortedData = [...dbData].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

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

      // 5. Calculate Indicators
      const processedData = calculateBollingerBands(calculateRSI(mappedData));

      // [MODIFIED] Pass the timeframe to analyzeAllTradingSignals to support time-based exits
      const signals = analyzeAllTradingSignals(
        processedData,
        timeframe as "1d" | "1h" | "15m",
      );

      return NextResponse.json({
        data: processedData,
        signals,
        advice,
      });
    }

    return NextResponse.json({ data: [], signals: [], advice });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[API Route - ${ticker}] Error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
