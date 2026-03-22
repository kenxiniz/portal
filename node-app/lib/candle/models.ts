/* lib/candle/models.ts */
import mongoose, { Schema, Document } from "mongoose";

export interface ICandle extends Document {
  timestamp: Date;
  meta: {
    ticker: string;
    timeframe: string; // '1d', '1h', '15m'
  };
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  expireAt: Date; // TTL Index Field
}

const CandleSchema = new Schema<ICandle>({
  timestamp: { type: Date, required: true },
  meta: {
    ticker: { type: String, required: true },
    timeframe: { type: String, required: true },
  },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  expireAt: { type: Date, required: true },
});

// Create TTL index: MongoDB automatically deletes documents when 'expireAt' is reached
CandleSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
// Optimization for queries
CandleSchema.index({ "meta.ticker": 1, "meta.timeframe": 1, timestamp: -1 });

export const CandleKR =
  mongoose.models.CandleKR ||
  mongoose.model<ICandle>("CandleKR", CandleSchema, "candles_kr");
export const CandleUS =
  mongoose.models.CandleUS ||
  mongoose.model<ICandle>("CandleUS", CandleSchema, "candles_us");
