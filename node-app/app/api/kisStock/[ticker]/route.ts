/* /app/api/kisStock/[ticker]/route.ts */

import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/mongodb";
import { getCandles, saveCandle } from "../../../../lib/candle/service";
import {
  calculateRSI,
  calculateBollingerBands,
  analyzeAllTradingSignals,
  StockDataPoint, // [FIX] 이 부분을 추가해야 합니다.
} from "../../../../lib/stockUtils";
import { getDailyStockData, getMinuteStockData } from "../../../../lib/kisApi";
import mongoose from "mongoose";

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
    let dbData = await getCandles("US", ticker, timeframe, 100, forceRefresh);

    // 3. Sync with KIS API if refresh requested or DB is empty
    if (forceRefresh || !dbData || dbData.length === 0) {
      console.log(`[${ticker}] Syncing ${timeframe} data from KIS API...`);

      // [FIX] any[] 제거
      let apiData: StockDataPoint[] = [];

      if (timeframe === "1d") {
        apiData = await getDailyStockData(ticker);
      } else {
        const gap = timeframe === "1h" ? 60 : 15;
        apiData = await getMinuteStockData(ticker, gap);
      }

      if (apiData && apiData.length > 0) {
        // Promise.all을 사용하여 병렬 저장하면 속도가 더 빠릅니다.
        await Promise.all(
          apiData.map((candle) =>
            saveCandle("US", ticker, timeframe, {
              timestamp: candle.date,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
            }),
          ),
        );

        // [ADD] 작업 완료 후 요약 로그 한 줄만 출력
        console.log(
          `[${ticker}] Successfully synced ${apiData.length} candles for ${timeframe}.`,
        );

        dbData = await getCandles("US", ticker, timeframe, 1000, true);
      }
    }

    if (dbData && dbData.length > 0) {
      // [FIX] DB 데이터를 시간순(오름차순)으로 확실하게 정렬
      const sortedData = [...dbData].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const mappedData = sortedData.map((c) => ({
        // [FIX] ISO String 변환 시 로컬 타임존 이슈를 피하기 위해 replace 활용
        date:
          timeframe === "1d"
            ? new Date(c.timestamp).toISOString().split("T")[0]
            : new Date(c.timestamp)
                .toISOString()
                .replace("T", " ")
                .substring(0, 19),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      // [CRITICAL FIX] 지표 계산은 반드시 과거부터 현재 순서인 mappedData 위에서 수행되어야 함
      // calculateRSI 등이 배열의 인덱스 순서대로 계산하기 때문입니다.
      const rsiData = calculateRSI(mappedData);
      const processedData = calculateBollingerBands(rsiData);
      const signals = analyzeAllTradingSignals(processedData);

      return NextResponse.json({
        data: processedData, // 이미 시간순으로 정렬된 상태
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
