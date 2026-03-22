/* lib/scheduler/telegramService.ts */

import axios, { AxiosError } from "axios";
import { schedulerConfig } from "./config";
import { StockSignalInfo } from "./types";
import { LottoSet } from "@/types/lotto";

// Define strict types for Telegram API to resolve ESLint 'no-explicit-any' errors
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

export class TelegramNotificationService {
  private botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN;
  private chatIds: string[] = [];

  constructor() {
    // Parse multiple chat IDs from environment variables
    const rawChatIds =
      process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;

    if (rawChatIds) {
      this.chatIds = rawChatIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    if (!this.botToken || this.chatIds.length === 0) {
      console.warn(
        "Telegram bot token or chat IDs are missing in environment variables.",
      );
    }
  }

  // Replaced 'any' with 'ReplyMarkup'
  public async notify(
    message: string,
    replyMarkup?: ReplyMarkup,
  ): Promise<void> {
    if (!this.botToken || this.chatIds.length === 0) {
      console.error(
        "Cannot send message: Telegram credentials or chat IDs are not configured.",
      );
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    console.log(
      `Attempting to send Telegram message to ${this.chatIds.length} chats.`,
    );

    // Map each chat ID to a message sending promise
    const sendPromises = this.chatIds.map(async (chatId) => {
      try {
        // Replaced 'any' with 'SendMessagePayload'
        const payload: SendMessagePayload = {
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        };

        if (replyMarkup) {
          payload.reply_markup = replyMarkup;
        }

        await axios.post(url, payload);
        console.log(`Successfully sent Telegram message to chat: ${chatId}`);
      } catch (error) {
        // Used unknown type and type guard to avoid 'any'
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const axiosError = error as AxiosError;
        console.error(
          `Failed to send Telegram message to chat ${chatId}:`,
          axiosError.response?.data || errorMessage,
        );
        // Throwing error to reflect the failure in Promise.allSettled result
        throw error;
      }
    });

    // Execute all promises concurrently and wait for all to finish
    await Promise.allSettled(sendPromises);
  }

  // Replaced 'any' with 'ReplyMarkup'
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

  public createStockStatusMessage = (signals: StockSignalInfo[]): string => {
    console.log("Generating stock status message report.");

    let message = `<b>🚀 오늘의 주식 폼 미쳤다! 📈</b>\n`;
    message += `오늘의 투자 인사이트, 켄신님이 콕 집어드려요.\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;

    // Removed any by using the proper interface
    signals.forEach((item: StockSignalInfo, index: number) => {
      const { name, currentSignal, lastMeaningfulSignal, advice } = item;
      const isHold = currentSignal.type === "hold";
      const targetSignal =
        isHold && lastMeaningfulSignal ? lastMeaningfulSignal : currentSignal;

      let statusText = "";
      if (targetSignal.type === "buy") statusText = "당장 매수각";
      else if (targetSignal.type === "inverse-buy")
        statusText = "인버스 매수 (방어모드!)";
      else if (targetSignal.type === "sell") statusText = "지금이 익절 타이밍";

      if (
        isHold &&
        (targetSignal.type === "buy" || targetSignal.type === "inverse-buy")
      ) {
        statusText = "존버 가보자고! (매수 유지)";
      }

      message += `<b>${index + 1}. 💎 ${name}</b>\n`;
      message += `<b>🔥 시그널:</b> <code>${statusText}</code>\n`;
      message += `<b>⏰ 신호 발생:</b> ${targetSignal.date} (${targetSignal.reason})\n`;

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

      if (advice && !advice.error) {
        // ... (AI Advice 부분 기존 코드 유지) ...
      } else if (advice?.error) {
        message += `\n<b>⚠️ AI가 아직 분석 중이에요. 조금만 기다려주세요!</b>\n`;
      }

      // Add a specific redirect link for this ticker
      const targetPath = encodeURIComponent(`kis-stock?ticker=${name}`);
      const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
      message += `\n<a href="${redirectLink}">👉 [${name}] 상세 차트 확인하기</a>\n`;

      message += `\n━━━━━━━━━━━━━━━━━━\n`;
    });

    // Remove the general link at the bottom since we now have per-stock links
    return message;
  };
}
