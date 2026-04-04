/* lib/candle/service.ts */

import mongoose from "mongoose";

// --- Interfaces ---
export interface CandleInput {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- Base Schema ---
// Defines the structure without binding to a specific collection yet
const CandleSchema = new mongoose.Schema(
  {
    ticker: { type: String, required: true },
    timeframe: { type: String, required: true },
    timestamp: { type: String, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { timestamps: true },
);

// Compound index to prevent duplicate candles and speed up queries
CandleSchema.index({ ticker: 1, timeframe: 1, timestamp: 1 }, { unique: true });

// --- Separate Models for US and KR ---
// Mongoose will create 'us_candles' and 'kr_candles' collections respectively
const UsCandle =
  mongoose.models.UsCandle ||
  mongoose.model("UsCandle", CandleSchema, "us_candles");
const KrCandle =
  mongoose.models.KrCandle ||
  mongoose.model("KrCandle", CandleSchema, "kr_candles");

// Helper to get the correct model based on region
const getModel = (region: "US" | "KR") => {
  return region === "US" ? UsCandle : KrCandle;
};

// --- Services ---

export const getCandles = async (
  region: "US" | "KR",
  ticker: string,
  timeframe: string,
  limit: number = 500,
  forceRefresh: boolean = false,
) => {
  if (forceRefresh) return [];

  const Model = getModel(region);
  const data = await Model.find({ ticker, timeframe })
    .sort({ timestamp: -1 }) // Sort descending to get latest first
    .limit(limit)
    .lean();

  return data;
};

// Keep existing single save function for backward compatibility if needed elsewhere
export const saveCandle = async (
  region: "US" | "KR",
  ticker: string,
  timeframe: string,
  candleData: CandleInput,
) => {
  const Model = getModel(region);
  await Model.updateOne(
    { ticker, timeframe, timestamp: candleData.timestamp },
    {
      $set: {
        ticker,
        timeframe,
        timestamp: candleData.timestamp,
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: candleData.volume,
      },
    },
    { upsert: true },
  );
};

// Bulk insert to resolve performance bottleneck (N+1 query issue)
export const saveCandlesBulk = async (
  region: "US" | "KR",
  ticker: string,
  timeframe: string,
  candles: CandleInput[],
) => {
  if (!candles || candles.length === 0) return;

  const Model = getModel(region);

  // Prepare bulk operations for fast execution
  const bulkOps = candles.map((candle) => ({
    updateOne: {
      filter: { ticker, timeframe, timestamp: candle.timestamp },
      update: {
        $set: {
          ticker,
          timeframe,
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        },
      },
      upsert: true, // Insert if not exists, update if exists
    },
  }));

  try {
    await Model.bulkWrite(bulkOps);
    console.log(
      `[DB] Successfully bulk inserted ${bulkOps.length} candles for ${ticker} (${region})`,
    );
  } catch (error) {
    console.error(`[DB] Bulk write error for ${ticker} (${region}):`, error);
    throw error;
  }
};
