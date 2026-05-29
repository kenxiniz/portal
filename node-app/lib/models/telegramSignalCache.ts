/* lib/models/telegramSignalCache.ts */

import mongoose, { Schema, Document } from "mongoose";

export interface ITelegramSignalCache extends Document {
    cacheKey: string;
    lastSentValue: string;
    updatedAt: Date;
}

const TelegramSignalCacheSchema: Schema = new Schema({
    cacheKey: { type: String, required: true, unique: true },
    lastSentValue: { type: String, required: true },

    // 💡 TTL 인덱스 추가: 데이터가 생성/업데이트된 지 3일(259200초)이 지나면 몽고DB가 백그라운드에서 자동 삭제
    updatedAt: { type: Date, default: Date.now, expires: 259200 },
});

export const TelegramSignalCache =
    mongoose.models.TelegramSignalCache ||
    mongoose.model<ITelegramSignalCache>(
        "TelegramSignalCache",
        TelegramSignalCacheSchema,
        "telegramsignalcaches",
    );