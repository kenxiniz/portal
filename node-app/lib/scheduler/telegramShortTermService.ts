/* lib/scheduler/telegramShortTermService.ts */

import axios, { AxiosError } from "axios";
import { schedulerConfig } from "./config";
import { TradingSignal } from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";

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

export class TelegramShortTermService {
  private botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN;
  private shortTermChatIds: string[] = [];

  private static sentSignalCache: Record<string, string> = {};

  constructor() {
    const rawShortTermIds = process.env.TELEGRAM_CHAT_IDS;

    if (rawShortTermIds) {
      const parsedIds = rawShortTermIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      this.shortTermChatIds = Array.from(new Set(parsedIds));
    }

    if (!this.botToken || this.shortTermChatIds.length === 0) {
      console.warn(
        "Telegram bot token or short-term chat IDs are missing in environment variables.",
      );
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

  private getTimeframeDisplayName(timeframe: string): string {
    if (timeframe === "1h") return "1시간 봉";
    if (timeframe === "15m") return "15분 봉";
    return timeframe.toUpperCase();
  }

  public async notifyRealtimeSignal(
    ticker: string,
    timeframe: string,
    signals: TradingSignal[],
  ): Promise<void> {
    if (
      !this.botToken ||
      this.shortTermChatIds.length === 0 ||
      !signals ||
      signals.length === 0
    ) {
      return;
    }

    const latestSignal = signals[signals.length - 1];

    if (latestSignal.type.includes("buy") || latestSignal.type === "sell") {
      const signalDate = latestSignal.date;
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const sendPromises = this.shortTermChatIds.map(async (chatId) => {
        const cacheKey = `${chatId}_${ticker}_${timeframe}`;
        const lastSentDate = TelegramShortTermService.sentSignalCache[cacheKey];

        if (lastSentDate !== signalDate) {
          TelegramShortTermService.sentSignalCache[cacheKey] = signalDate;

          const displayDate = this.formatSignalTime(signalDate);
          const timeframeDisplay = this.getTimeframeDisplayName(timeframe);

          const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
            (s) => s.ticker === ticker,
          );
          const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
            (s) => s.ticker === ticker,
          );
          const isInverse = !!(usStock?.isInverse || kStock?.isInverse);

          let subTag = "";
          if (latestSignal.type.includes("buy")) {
            const isMatchingMarketGrowth =
              (!isInverse && latestSignal.type === "buy") ||
              (isInverse && latestSignal.type === "inverse-buy");

            subTag = isMatchingMarketGrowth
              ? "🚀 [가즈아!]"
              : "⚠️ [고위험-매매참고]";
          }

          let message = "";

          if (latestSignal.type.includes("buy")) {
            const priceStr = latestSignal.entryPrice
              ? `$${latestSignal.entryPrice.toFixed(2)}`
              : "N/A";

            message += `🚨 <b>[${timeframeDisplay} 단타 매수 신호 감지]</b> ${subTag}\n\n`;
            message += `<b>종목:</b> ${ticker}\n`;
            message += `<b>발생 시간:</b> ${displayDate}\n`;
            message += `<b>매수가:</b> ${priceStr}\n`;
            message += `<b>근거:</b> ${latestSignal.reason}\n\n`;
          } else if (latestSignal.type === "sell") {
            const profitRateNum = Number(latestSignal.profitRate) || 0;
            const isProfit = profitRateNum >= 0;
            const headerIcon = isProfit ? "💰" : "📉";
            const headerText = isProfit ? "익절(수익)" : "손절";

            message += `${headerIcon} <b>[${timeframeDisplay} 단타 ${headerText} 신호 감지]</b>\n\n`;
            message += `<b>종목:</b> ${ticker}\n`;
            message += `<b>발생 시간:</b> ${displayDate}\n`;
            message += `<b>수익률:</b> ${profitRateNum > 0 ? "+" : ""}${profitRateNum.toFixed(2)}%\n`;
            message += `<b>근거:</b> ${latestSignal.reason}\n\n`;
          }

          const targetPath = encodeURIComponent(
            `kis-stock?ticker=${ticker}&tf=${timeframe}`,
          );
          const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
          message += `<a href="${redirectLink}">👉 상세 차트 바로가기</a>\n\n`;
          message += `<i>💡 장기 투자를 위한 추세 확인은 '일봉' 신호를 참고해 주세요.</i>`;

          try {
            const payload: SendMessagePayload = {
              chat_id: chatId,
              text: message,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            };

            await axios.post(url, payload);
            console.log(
              `[Scheduler] Sent short-term realtime signal for ${ticker} to chat ${chatId}`,
            );
          } catch (error) {
            // Rollback cache if telegram API request completely fails
            TelegramShortTermService.sentSignalCache[cacheKey] =
              lastSentDate || "";

            // [FIXED] Use AxiosError for more detailed logging
            const axiosError = error as AxiosError;
            console.error(
              `[Scheduler] Failed to send short-term signal to ${chatId}:`,
              axiosError.response?.data || axiosError.message,
            );
          }
        }
      });

      await Promise.allSettled(sendPromises);
    }
  }
}
