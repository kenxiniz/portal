// testQueue.ts
// Execution: npx tsx testQueue.ts

import "dotenv/config";
import { connectDB } from "./lib/mongodb";
import { TickerAdvice } from "./lib/models/advice";
import { getBatchGeminiAdvice, BatchInputItem } from "./lib/geminiUtils";
import { TradingSignal, StockDataPoint } from "./lib/stockUtils";
import stockConfig from "./lib/stock.json";

const getDummySignals = (): TradingSignal[] => [
  {
    date: "2024-03-01",
    type: "buy",
    reason: "Technical breakout",
    entryPrice: 150.5,
  },
];

const getDummyRecentData = (): StockDataPoint[] => [
  {
    date: "2024-03-27",
    close: 155.0,
    open: 152.0,
    high: 156.0,
    low: 151.0,
    volume: 500000,
    rsi: 58.5,
  },
];

async function processMarketBatch(market: "us" | "kr") {
  const tickers =
    market === "us"
      ? stockConfig.us_stocks.map((s: { ticker: string }) => s.ticker)
      : stockConfig.k_stocks.map((s: { ticker: string }) => s.ticker);

  console.log(
    `[INFO] Starting batch analysis for ${market.toUpperCase()} market.`,
  );

  const items: BatchInputItem[] = tickers.map((t) => ({
    ticker: t,
    stockName:
      market === "kr"
        ? stockConfig.k_stocks.find(
            (s: { ticker: string; name: string }) => s.ticker === t,
          )?.name
        : undefined,
    signals: getDummySignals(),
    recentStockData: getDummyRecentData(),
  }));

  try {
    const batchResults = await getBatchGeminiAdvice(items, market);

    for (const t of tickers) {
      const result = batchResults[t];

      if (!result || result.error) {
        console.warn(
          `[WARN] [${t}] Gemini failed. Starting deep debug for fallback...`,
        );

        try {
          // [DEBUG] RAW DATA CHECK
          const rawRecord = await TickerAdvice.findOne({ ticker: t }).lean();

          if (!rawRecord) {
            console.error(
              `[DEBUG] [${t}] No record found at all for this ticker. Check if ticker string in DB is exactly "${t}" (case-sensitive).`,
            );
            continue;
          }

          console.log(
            `[DEBUG] [${t}] Record found in DB. Checking content:`,
            JSON.stringify(rawRecord).substring(0, 100),
          );

          if (!rawRecord.advice) {
            console.error(
              `[DEBUG] [${t}] Record exists but 'advice' field is missing.`,
            );
          } else if (rawRecord.advice.error) {
            console.error(
              `[DEBUG] [${t}] Record exists but 'advice.error' is TRUE. This record is treated as invalid.`,
            );
          } else {
            console.log(`[INFO] [${t}] Fallback SUCCESS: Found valid advice.`);
          }
        } catch (dbError: any) {
          console.error(
            `[ERROR] [${t}] DB Operation Error: ${dbError.message}`,
          );
        }
      } else {
        console.log(`[SUCCESS] [${t}] New advice generated.`);
      }
    }
  } catch (error) {
    console.error(
      `[ERROR] Fatal error during ${market.toUpperCase()} batch process:`,
      error,
    );
  }
}

async function runTest() {
  console.log("[START] Batch and Fallback Test Initiation.");

  try {
    await connectDB();
    console.log("[INFO] Database connection successful.");

    // [DEBUG] Collection total count check
    const totalCount = await TickerAdvice.countDocuments();
    console.log(
      `[DEBUG] Total documents in TickerAdvice collection: ${totalCount}`,
    );

    await processMarketBatch("us");
    await processMarketBatch("kr");
  } catch (err: any) {
    console.error("[FATAL] Test aborted:", err.message);
  } finally {
    console.log("[END] Test sequence finished.");
    process.exit(0);
  }
}

runTest();
