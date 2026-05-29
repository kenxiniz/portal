/* lib/scheduler/telegramLongTermService.ts */

import axios from "axios";
import https from "https";
import { schedulerConfig } from "./config";
import { StockSignalInfo } from "./types";
import { LottoSet } from "@/types/lotto";
import { TradingSignal } from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";

// MongoDB 연결 및 소문자로 변경된 모델 임포트
import { connectDB } from "@/lib/mongodb";
import { TelegramSignalCache } from "@/lib/models/telegramSignalCache";

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export type ReplyMarkup = InlineKeyboardMarkup;

interface SendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: string;
  disable_web_page_preview?: boolean;
  reply_markup?: ReplyMarkup;
}

interface StockConfigItem {
  ticker: string;
  isInverse?: boolean;
}

interface ExtendedTradingSignal extends TradingSignal {
  price?: number;
  close?: number;
  currentPrice?: number;
}

interface ExtendedStockSignalInfo extends StockSignalInfo {
  currentPrice?: number;
  profitRate?: number;
}

// Create IPv4 agent
const ipv4Agent = new https.Agent({ family: 4 });

export class TelegramLongTermService {
  private botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN?.trim();
  private longTermChatIds: string[] = [];

  constructor() {
    const rawChatIds = process.env.TELEGRAM_CHAT_ID?.trim();

    if (rawChatIds) {
      this.longTermChatIds = rawChatIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    if (!this.botToken || this.longTermChatIds.length === 0) {
      console.warn(
        "Telegram bot token or long-term chat IDs are missing in environment variables.",
      );
    }
  }

  public async notify(
    message: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    if (!this.botToken || this.longTermChatIds.length === 0) {
      console.error(
        "Cannot send message: Telegram credentials or long-term chat IDs are not configured.",
      );
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    console.log(
      `Attempting to send Telegram message to ${this.longTermChatIds.length} long-term chat(s).`,
    );

    const sendPromises = this.longTermChatIds.map(async (chatId) => {
      try {
        const payload: SendMessagePayload = {
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        };

        if (replyMarkup) {
          payload.reply_markup = replyMarkup;
        }

        await axios.post(url, payload, { httpsAgent: ipv4Agent });
        console.log(`Successfully sent Telegram message to chat: ${chatId}`);
      } catch (error: unknown) {
        console.error(`======================================`);
        console.error(
          `[Telegram Error] Failed to send message to chat ${chatId}`,
        );
        console.error("RAW ERROR OBJECT:");
        console.error(error);
        console.error(`======================================`);
      }
    });

    await Promise.all(sendPromises);
  }

  public async notifyInChunks<T>(
    createMessage: (chunk: T[]) => string,
    items: T[],
    chunkSize: number,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const message = createMessage(chunk);
      await this.notify(message, replyMarkup);
    }
  }

  private formatSignalTime(dateString: string): string {
    try {
      const safeDateStr = dateString.includes(" ")
        ? dateString.replace(" ", "T")
        : dateString;
      const date = new Date(safeDateStr);

      if (isNaN(date.getTime())) return dateString;

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch {
      return dateString.substring(0, 16);
    }
  }

  // Helper method to find the matching entry signal for a sell signal
  private findRecentEntrySignal(signals: TradingSignal[]): TradingSignal | null {
    for (let i = signals.length - 2; i >= 0; i--) {
      if (signals[i].type === "buy" || signals[i].type === "inverse-buy") {
        return signals[i];
      }
    }
    return null;
  }

  public async notifyRealtimeSignal(
    ticker: string,
    timeframe: string,
    signals: TradingSignal[],
  ): Promise<void> {
    if (
      !this.botToken ||
      this.longTermChatIds.length === 0 ||
      !signals ||
      signals.length === 0
    ) {
      return;
    }

    const latestSignal = signals[signals.length - 1];

    if (latestSignal.type.includes("buy") || latestSignal.type === "sell") {
      const signalDate = latestSignal.date;
      const displayDate = this.formatSignalTime(signalDate);
      const timeframeDisplay = "일봉";

      const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
        (s) => s.ticker === ticker,
      );
      const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
        (s) => s.ticker === ticker,
      );
      const isInverse = !!(usStock?.isInverse || kStock?.isInverse);

      let message = "";

      if (latestSignal.type.includes("buy")) {
        const isMatchingMarketGrowth =
          (!isInverse && latestSignal.type === "buy") ||
          (isInverse && latestSignal.type === "inverse-buy");

        const subTag = isMatchingMarketGrowth
          ? "🚀 [가즈아!]"
          : "⚠️ [고위험-매매참고]";

        const priceStr = latestSignal.entryPrice
          ? `$${latestSignal.entryPrice.toFixed(2)}`
          : "N/A";

        const isInverseSignal =
          latestSignal.type === "inverse-buy" ||
          (isInverse && latestSignal.type === "buy");
        const headerTitle = isInverseSignal ? "시장 과열 참고" : "매수";
        const priceLabel = isInverseSignal ? "기준가" : "매수가";

        message += `🚨 <b>[${timeframeDisplay} ${headerTitle} 신호 감지]</b> ${subTag}\n\n`;
        message += `<b>종목:</b> ${ticker}\n`;
        message += `<b>발생 시간:</b> ${displayDate}\n`;
        message += `<b>${priceLabel}:</b> ${priceStr}\n`;
        message += `<b>근거:</b> ${latestSignal.reason}\n\n`;
      } else if (latestSignal.type === "sell") {
        let profitRateNum = Number(latestSignal.profitRate);
        if (isNaN(profitRateNum)) profitRateNum = 0;

        const isProfit = profitRateNum >= 0;
        const headerIcon = isProfit ? "💰" : "📉";

        // Find entry signal to check if this is clearing an inverse position
        const entrySignal = this.findRecentEntrySignal(signals);
        const isInversePlay =
          isInverse || (entrySignal && entrySignal.type === "inverse-buy");

        const isExplicitDismissal =
          latestSignal.reason.includes("해제") ||
          latestSignal.reason.includes("무효화");

        const isDismissal = isExplicitDismissal || isInversePlay;
        const headerText = isDismissal
          ? "시장 과열 참고 해제"
          : isProfit
            ? "익절(수익)"
            : "손절";

        message += `${headerIcon} <b>[${timeframeDisplay} ${headerText} 알림]</b>\n\n`;
        message += `<b>종목:</b> ${ticker}\n`;
        message += `<b>발생 시간:</b> ${displayDate}\n`;

        if (!isDismissal) {
          message += `<b>수익률:</b> ${profitRateNum > 0 ? "+" : ""}${profitRateNum.toFixed(2)}%\n`;
        } else if (isInversePlay) {
          message += `<b>참고 수익률:</b> ${profitRateNum > 0 ? "+" : ""}${profitRateNum.toFixed(2)}%\n`;
        }

        message += `<b>상세:</b> ${latestSignal.reason}\n\n`;
      }

      const targetPath = encodeURIComponent(
        `kis-stock?ticker=${ticker}&tf=${timeframe}`,
      );
      const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
      message += `<a href="${redirectLink}">👉 상세 차트 바로가기</a>\n\n`;

      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      // 💡 MongoDB 연결 보장
      await connectDB();

      const sendPromises = this.longTermChatIds.map(async (chatId) => {
        // 💡 캐시 키에 신호 타입(buy/sell 등)을 추가하여 다른 신호에 의해 덮어씌워지는 것 방지
        const cacheKey = `${chatId}_${ticker}_${timeframe}_${latestSignal.type}`;

        // 💡 1d (일봉) 인 경우 날짜(YYYY-MM-DD)만 추출하여 하루에 단 한 번만 검증하도록 처리
        const dateKey = signalDate.split("T")[0].split(" ")[0];
        const checkValue = timeframe === "1d" ? dateKey : signalDate;

        // 💡 몽고DB에서 기존 발송 기록 조회
        const existingCache = await TelegramSignalCache.findOne({ cacheKey });
        const lastSentValue = existingCache ? existingCache.lastSentValue : null;

        if (lastSentValue !== checkValue) {
          // 💡 중복 발송 방지를 위해 몽고DB에 먼저 덮어쓰기 (Upsert)
          await TelegramSignalCache.findOneAndUpdate(
            { cacheKey },
            { lastSentValue: checkValue, updatedAt: new Date() },
            { upsert: true, new: true }
          );

          try {
            const payload: SendMessagePayload = {
              chat_id: chatId,
              text: message,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            };

            await axios.post(url, payload, { httpsAgent: ipv4Agent });
            console.log(
              `[Scheduler] Sent long-term realtime signal for ${ticker} to chat ${chatId}`,
            );
          } catch (error: unknown) {
            // 💡 발송 실패 시 몽고DB 캐시 원상복구
            if (lastSentValue) {
              await TelegramSignalCache.findOneAndUpdate(
                { cacheKey },
                { lastSentValue: lastSentValue, updatedAt: new Date() }
              );
            } else {
              await TelegramSignalCache.deleteOne({ cacheKey });
            }

            console.error(`======================================`);
            console.error(
              `[Scheduler Error] Failed to send long-term signal to ${chatId}`,
            );
            console.error("RAW ERROR OBJECT:");
            console.error(error);
            console.error(`======================================`);
          }
        }
      });

      await Promise.all(sendPromises);
    }
  }

  public createStockStatusMessage = (signals: StockSignalInfo[]): string => {
    let message = `<b>🚀 오늘의 주식 폼 미쳤다! 📈</b>\n`;
    message += `오늘의 투자 인사이트, 켄신님이 콕 집어드려요.\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;

    let holdingSummary = `<b>💸 [내 계좌 요약 (보유 중)]</b>\n`;
    let holdingCount = 0;

    // Upper summary list: filter out inverse stocks
    signals.forEach((item) => {
      const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
        (s) => s.ticker === item.name,
      );
      const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
        (s) => s.ticker === item.name,
      );
      const isInverse = !!(usStock?.isInverse || kStock?.isInverse);

      if (isInverse) return;

      const { name, currentSignal, lastMeaningfulSignal } = item;
      const isHold = currentSignal.type === "hold";
      const targetSignal =
        isHold && lastMeaningfulSignal ? lastMeaningfulSignal : currentSignal;

      if (isHold || currentSignal.type === "buy") {
        if (targetSignal.type === "buy") {
          holdingCount++;

          if (targetSignal.entryPrice) {
            const entryPrice = targetSignal.entryPrice;
            const extItem = item as ExtendedStockSignalInfo;
            const extCurrentSignal = currentSignal as ExtendedTradingSignal;

            const currentPrice =
              extItem.currentPrice ||
              extCurrentSignal.currentPrice ||
              extCurrentSignal.price ||
              extCurrentSignal.close ||
              currentSignal.realizedPrice;

            let profitRate: number | null = null;

            if (currentPrice) {
              if (targetSignal.type === "buy") {
                profitRate = ((currentPrice - entryPrice) / entryPrice) * 100;
              }
            } else if (
              extCurrentSignal.profitRate !== undefined &&
              extCurrentSignal.profitRate !== null
            ) {
              profitRate = Number(extCurrentSignal.profitRate);
            } else if (
              extItem.profitRate !== undefined &&
              extItem.profitRate !== null
            ) {
              profitRate = Number(extItem.profitRate);
            }

            if (profitRate !== null && !isNaN(profitRate)) {
              const sign = profitRate > 0 ? "+" : "";
              const statusLabel =
                profitRate > 0
                  ? "개이득 중 😍"
                  : profitRate < 0
                    ? "눈물 😭"
                    : "본전 😐";

              holdingSummary += `▪️ <b>${name}:</b> ${statusLabel} (${sign}${profitRate.toFixed(2)}%)\n`;
            } else {
              holdingSummary += `▪️ <b>${name}:</b> 계산 불가 <i>(현재가 지연)</i>\n`;
            }
          } else {
            holdingSummary += `▪️ <b>${name}:</b> 계산 불가 <i>(진입가 지연)</i>\n`;
          }
        }
      }
    });

    if (holdingCount === 0) {
      holdingSummary += `현재 보유 중인 종목이 없습니다 (현금 관망 🧘‍♂️)\n`;
    }

    message += holdingSummary + `\n━━━━━━━━━━━━━━━━━━\n\n`;

    // Lower detailed list: includes inverse (overheat reference) stocks
    signals.forEach((item: StockSignalInfo, index: number) => {
      const { name, currentSignal, lastMeaningfulSignal, advice } = item;
      const isHold = currentSignal.type === "hold";
      const targetSignal =
        isHold && lastMeaningfulSignal ? lastMeaningfulSignal : currentSignal;

      let statusText = "";
      if (targetSignal.type === "buy") statusText = "당장 매수각";
      else if (targetSignal.type === "inverse-buy")
        statusText = "시장 과열 참고 (방어모드!)";
      else if (targetSignal.type === "sell") statusText = "지금이 익절 타이밍";

      let profitRateText = "";
      if (
        isHold &&
        (targetSignal.type === "buy" || targetSignal.type === "inverse-buy")
      ) {
        statusText =
          targetSignal.type === "buy"
            ? "존버 가보자고! (매수 유지)"
            : "시장 과열 지속 (관망 유지)";

        if (targetSignal.entryPrice) {
          const entryPrice = targetSignal.entryPrice;
          const extItem = item as ExtendedStockSignalInfo;
          const extCurrentSignal = currentSignal as ExtendedTradingSignal;

          const currentPrice =
            extItem.currentPrice ||
            extCurrentSignal.currentPrice ||
            extCurrentSignal.price ||
            extCurrentSignal.close ||
            currentSignal.realizedPrice;

          let profitRate: number | null = null;

          if (currentPrice) {
            if (targetSignal.type === "buy") {
              profitRate = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else if (targetSignal.type === "inverse-buy") {
              profitRate = ((entryPrice - currentPrice) / entryPrice) * 100;
            }
          } else if (
            extCurrentSignal.profitRate !== undefined &&
            extCurrentSignal.profitRate !== null
          ) {
            profitRate = Number(extCurrentSignal.profitRate);
          } else if (
            extItem.profitRate !== undefined &&
            extItem.profitRate !== null
          ) {
            profitRate = Number(extItem.profitRate);
          }

          if (profitRate !== null && !isNaN(profitRate)) {
            const sign = profitRate > 0 ? "+" : "";
            const color =
              profitRate > 0 ? "개이득" : profitRate < 0 ? "눈물" : "본전";
            profitRateText = `\n<b>💸 참고 수익률:</b> ${sign}${profitRate.toFixed(2)}% (${color} 진행 중)`;
          } else {
            profitRateText = `\n<b>💸 참고 수익률:</b> <i>계산 불가 (현재가 데이터 누락)</i>`;
          }
        }
      }

      message += `<b>${index + 1}. 💎 ${name}</b>\n`;
      message += `<b>🔥 시그널:</b> <code>${statusText}</code>`;
      if (profitRateText) {
        message += profitRateText;
      }
      message += `\n<b>⏰ 신호 발생:</b> ${targetSignal.date} (${targetSignal.reason})\n`;

      if (advice && !advice.error) {
        message += `\n<b>🤖 AI의 팩폭 한마디:</b>\n`;
        message += `${advice.message}\n`;

        if (advice.action) {
          let actionLabel = advice.action.toUpperCase();
          let emoji = "👀";
          if (actionLabel === "BUY") {
            actionLabel = "풀매수 가즈아";
            emoji = "✅";
          } else if (actionLabel === "SELL") {
            actionLabel = "일단 튀어! (매도)";
            emoji = "🚨";
          } else if (actionLabel === "HOLD") {
            actionLabel = "일단 지켜보자";
            emoji = "⏸";
          }

          message += `<b>✨ AI의 결론:</b> ${emoji} #${actionLabel}\n`;
        }
      } else if (advice?.error) {
        message += `\n<b>⚠️ AI가 아직 분석 중이에요. 조금만 기다려주세요!</b>\n`;
      }

      const targetPath = encodeURIComponent(`kis-stock?ticker=${name}&tf=1d`);
      const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
      message += `\n<a href="${redirectLink}">👉 [${name}] 상세 차트 확인하기</a>\n`;
      message += `\n━━━━━━━━━━━━━━━━━━\n`;
    });

    return message;
  };

  public createLottoSetsMessage =
    (drawNo: number) =>
      (sets: LottoSet[]): string => {
        let message = `<b>[Draw No. ${drawNo}] Lotto Numbers</b>\n`;
        message += `<a href="${schedulerConfig.apiBaseUrl}/lotto">Check Full Numbers</a>\n\n`;

        sets.forEach((set, index) => {
          message += `<b>Set ${index + 1}:</b> ${set.numbers.join(", ")}\n`;
        });

        return message;
      };
}