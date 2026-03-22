/* lib/models/advice.ts */
import mongoose, { Schema, Document } from "mongoose";
// [FIX] Use AdviceObject instead of any for better type safety
import { AdviceObject } from "@/lib/stockUtils";

export interface ITickerAdvice extends Document {
  ticker: string;
  advice: AdviceObject; // [FIXED] Changed from 'any' to 'AdviceObject'
  updatedAt: Date;
}

const AdviceSchema: Schema = new Schema({
  ticker: { type: String, required: true, unique: true },
  advice: {
    type: Object,
    default: null,
  }, // Mongoose Schema still uses Object for flexible JSON
  updatedAt: { type: Date, default: Date.now },
});

// Explicitly target the 'tickeradvices' collection
export const TickerAdvice =
  mongoose.models.TickerAdvice ||
  mongoose.model<ITickerAdvice>("TickerAdvice", AdviceSchema, "tickeradvices");
