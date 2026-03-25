/* lib/scheduler/telegramService.ts */

import axios, { AxiosError } from "axios";
import { schedulerConfig } from "./config";
import { StockSignalInfo } from "./types";
import { LottoSet } from "@/types/lotto";
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

// Internal interface for stock configuration item to avoid linting errors
interface StockConfigItem {
  ticker: string;
  isInverse?: boolean;
}

export class TelegramNotificationService {
  private botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN;
  private chatIds: string[] = [];

  // Static cache to persist across multiple instances and scheduler runs
  private static sentSignalCache: Record<string, string> = {};

  constructor() {
    const rawChatIds =
      process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;

    if (rawChatIds) {
      const parsedIds = rawChatIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      // Deduplicate chat IDs to prevent multiple sends to the same room
      this.chatIds = Array.from(new Set(parsedIds));
    }

    if (!this.botToken || this.chatIds.length === 0) {
      console.warn(
        "Telegram bot token or chat IDs are missing in environment variables.",
      );
    }
  }

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

    const sendPromises = this.chatIds.map(async (chatId) => {
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

        await axios.post(url, payload);
        console.log(`Successfully sent Telegram message to chat: ${chatId}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const axiosError = error as AxiosError;
        console.error(
          `Failed to send Telegram message to chat ${chatId}:`,
          axiosError.response?.data || errorMessage,
        );
        throw error;
      }
    });

    await Promise.allSettled(sendPromises);
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

  private getTimeframeDisplayName(timeframe: string): string {
    if (timeframe === "1h") return "1시간 봉";
    if (timeframe === "15m") return "15분 봉";
    if (timeframe === "1d") return "일봉";
    return timeframe.toUpperCase();
  }

  public async notifyRealtimeSignal(
    ticker: string,
    timeframe: string,
    signals: TradingSignal[],
  ): Promise<void> {
    if (
      !this.botToken ||
      this.chatIds.length === 0 ||
      !signals ||
      signals.length === 0
    ) {
      return;
    }

    const latestSignal = signals[signals.length - 1];

    if (latestSignal.type.includes("buy") || latestSignal.type === "sell") {
      const signalDate = latestSignal.date;
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const sendPromises = this.chatIds.map(async (chatId) => {
        const cacheKey = `${chatId}_${ticker}_${timeframe}`;
        const lastSentDate =
          TelegramNotificationService.sentSignalCache[cacheKey];

        if (lastSentDate !== signalDate) {
          // Optimistic lock: update cache immediately to prevent race conditions
          TelegramNotificationService.sentSignalCache[cacheKey] = signalDate;

          const displayDate = this.formatSignalTime(signalDate);
          const timeframeDisplay = this.getTimeframeDisplayName(timeframe);
          const isShortTerm = timeframe !== "1d";

          // Identify if the stock is an inverse ETF
          const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
            (s) => s.ticker === ticker,
          );
          const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
            (s) => s.ticker === ticker,
          );
          const isInverse = !!(usStock?.isInverse || kStock?.isInverse);

          // Determine subTag (Gazua vs High Risk) based on signal type and stock nature
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

            message += `🚨 <b>[${timeframeDisplay}${isShortTerm ? " 단타" : ""} 매수 신호 감지]</b> ${subTag}\n\n`;
            message += `<b>종목:</b> ${ticker}\n`;
            message += `<b>발생 시간:</b> ${displayDate}\n`;
            message += `<b>매수가:</b> ${priceStr}\n`;
            message += `<b>근거:</b> ${latestSignal.reason}\n\n`;
          } else if (latestSignal.type === "sell") {
            const profitRateNum = Number(latestSignal.profitRate) || 0;
            const isProfit = profitRateNum >= 0;
            const headerIcon = isProfit ? "💰" : "📉";
            const headerText = isProfit ? "익절(수익)" : "손절";

            message += `${headerIcon} <b>[${timeframeDisplay}${isShortTerm ? " 단타" : ""} ${headerText} 신호 감지]</b>\n\n`;
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
              `[Scheduler] Sent ${timeframe} realtime ${latestSignal.type} signal for ${ticker} to chat ${chatId}`,
            );
          } catch (error) {
            // Rollback cache if telegram API request completely fails
            TelegramNotificationService.sentSignalCache[cacheKey] =
              lastSentDate || "";
            console.error(
              `[Scheduler] Failed to send realtime signal to ${chatId}:`,
              error,
            );
          }
        }
      });

      await Promise.allSettled(sendPromises);
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

      const targetPath = encodeURIComponent(`kis-stock?ticker=${name}`);
      const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
      message += `\n<a href="${redirectLink}">👉 [${name}] 상세 차트 확인하기</a>\n`;

      message += `\n━━━━━━━━━━━━━━━━━━\n`;
    });

    return message;
  };
}
