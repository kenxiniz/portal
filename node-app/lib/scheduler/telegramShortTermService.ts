/* lib/scheduler/telegramShortTermService.ts */

import axios from "axios";
import https from "https"; // 💡 https 모듈 추가
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

// 💡 전역적으로 IPv4 강제 에이전트 생성
const ipv4Agent = new https.Agent({ family: 4 });

export class TelegramShortTermService {
  private botToken: string | undefined = process.env.TELEGRAM_BOT_TOKEN?.trim();
  private shortTermChatIds: string[] = [];

  private static sentSignalCache: Record<string, string> = {};

  constructor() {
    const rawShortTermIds = process.env.TELEGRAM_CHAT_IDS?.trim();

    // 환경 변수 문자열을 쉼표(,) 기준으로 분리하여 배열로 저장 (중복 제거 포함)
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

  // Helper method to find the matching entry signal for a sell signal
  private findRecentEntrySignal(
    signals: TradingSignal[],
  ): TradingSignal | null {
    // Iterate backwards from the second to last item to find the most recent buy/inverse-buy
    for (let i = signals.length - 2; i >= 0; i--) {
      if (signals[i].type === "buy" || signals[i].type === "inverse-buy") {
        return signals[i];
      }
    }
    return null;
  }

  public async notifyPivotBreach(
    ticker: string,
    currentPrice: number,
    pivotValue: number,
    type: "R2_UP" | "S2_DOWN",
    dateStr: string,
  ): Promise<void> {
    if (!this.botToken || this.shortTermChatIds.length === 0) return;

    const dateKey = dateStr.split("T")[0].split(" ")[0];
    const headerTitle =
      type === "R2_UP"
        ? "📈 [60분봉 피봇 R2 저항선 돌파]"
        : "📉 [60분봉 피봇 S2 지지선 이탈]";
    const description =
      type === "R2_UP"
        ? `현재 주가가 피봇 R2 저항선 이상으로 상승했습니다. 시장 과열 가능성에 유의하세요.`
        : `현재 주가가 피봇 S2 지지선 이하로 하락했습니다. 지지선 붕괴에 유의하세요.`;

    let message = `🚨 <b>${headerTitle}</b>\n\n`;
    message += `<b>종목:</b> ${ticker}\n`;
    message += `<b>기준 일자:</b> ${dateKey}\n`;
    message += `<b>현재가:</b> $${currentPrice.toFixed(2)}\n`;
    message += `<b>피봇 기준가:</b> $${pivotValue.toFixed(2)}\n\n`;
    message += `<b>상세 정보:</b>\n${description}\n\n`;

    const targetPath = encodeURIComponent(`kis-stock?ticker=${ticker}&tf=1h`);
    const redirectLink = `${schedulerConfig.apiBaseUrl}/api/redirect-chrome?target=${targetPath}`;
    message += `<a href="${redirectLink}">👉 60분봉 차트 확인하기</a>\n\n`;

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const sendPromises = this.shortTermChatIds.map(async (chatId) => {
      const cacheKey = `${chatId}_${ticker}_1h_pivot_${type}`;
      const lastSentValue = TelegramShortTermService.sentSignalCache[cacheKey];

      if (lastSentValue !== dateKey) {
        TelegramShortTermService.sentSignalCache[cacheKey] = dateKey;

        try {
          const payload: SendMessagePayload = {
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          };

          await axios.post(url, payload, { httpsAgent: ipv4Agent });
          console.log(
            `[Pivot Alert] Successfully notified short-term ${type} for ${ticker} to chat ${chatId}`,
          );
        } catch (error: unknown) {
          TelegramShortTermService.sentSignalCache[cacheKey] =
            lastSentValue || "";

          console.error(`======================================`);
          console.error(
            `[Pivot Alert Error] Failed to send short-term pivot to ${chatId}`,
          );
          console.error("RAW ERROR OBJECT:");
          console.error(error);
          console.error(`======================================`);
        }
      }
    });

    await Promise.allSettled(sendPromises);
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

    if (
      latestSignal.type === "buy" ||
      latestSignal.type === "inverse-buy" ||
      latestSignal.type === "sell"
    ) {
      const signalDate = latestSignal.date;
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      // 배열을 순회하며 모든 방에 메시지 전송 (병렬 처리)
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

          // 메시지 생성을 1번만 수행
          let message = "";

          if (
            latestSignal.type === "buy" ||
            latestSignal.type === "inverse-buy"
          ) {
            const isMatchingMarketGrowth =
              (!isInverse && latestSignal.type === "buy") ||
              (isInverse && latestSignal.type === "inverse-buy");

            const subTag = isMatchingMarketGrowth
              ? "🚀 [가즈아!]"
              : "⚠️ [고위험-매매참고]";

            const priceStr = latestSignal.entryPrice
              ? `$${latestSignal.entryPrice.toFixed(2)}`
              : "N/A";

            const isInverseSignal = latestSignal.type === "inverse-buy";
            const headerTitle = isInverseSignal
              ? "단타 시장 과열 참고"
              : "단타 매수";
            const priceLabel = isInverseSignal ? "기준가" : "매수가";

            message += `🚨 <b>[${timeframeDisplay} ${headerTitle} 신호 감지]</b> ${subTag}\n\n`;
            message += `<b>종목:</b> ${ticker}\n`;
            message += `<b>발생 시간:</b> ${displayDate}\n`;
            message += `<b>${priceLabel}:</b> ${priceStr}\n`;
            message += `<b>근거:</b> ${latestSignal.reason}\n\n`;
          } else if (latestSignal.type === "sell") {
            const profitRateNum = Number(latestSignal.profitRate) || 0;
            const isProfit = profitRateNum >= 0;
            const headerIcon = isProfit ? "💰" : "📉";

            // 'sell' can also be triggered to dismiss an inverse signal
            const isDismissal =
              latestSignal.reason.includes("해제") ||
              latestSignal.reason.includes("무효화");
            const headerText = isDismissal
              ? "신호 해제"
              : isProfit
                ? "익절(수익)"
                : "손절";
            const actionLabel = isDismissal ? "해제" : "매도";

            // Find the entry signal to display entry time and price
            const entrySignal = this.findRecentEntrySignal(signals);
            const entryTimeDisplay = entrySignal
              ? this.formatSignalTime(entrySignal.date)
              : "N/A";
            const entryPriceDisplay =
              entrySignal && entrySignal.entryPrice
                ? `$${entrySignal.entryPrice.toFixed(2)}`
                : "N/A";

            // Format current sell price (using realizedPrice if available)
            const sellPriceDisplay = latestSignal.realizedPrice
              ? `$${latestSignal.realizedPrice.toFixed(2)}`
              : "N/A";

            message += `${headerIcon} <b>[${timeframeDisplay} 단타 ${headerText} 알림]</b>\n\n`;
            message += `<b>종목:</b> ${ticker}\n`;
            message += `<b>${actionLabel} 시간:</b> ${displayDate}\n`;
            message += `<b>${actionLabel} 가격:</b> ${sellPriceDisplay}\n`;
            if (!isDismissal) {
              message += `<b>수익률:</b> ${profitRateNum > 0 ? "+" : ""}${profitRateNum.toFixed(2)}%\n`;
            }
            message += `<b>상세:</b> ${latestSignal.reason}\n\n`;

            const entryLabel = isDismissal ? "기준" : "진입";
            message += `<b>--- ${entryLabel} 정보 ---</b>\n`;
            message += `<b>${entryLabel} 시간:</b> ${entryTimeDisplay}\n`;
            message += `<b>${entryLabel} 가격:</b> ${entryPriceDisplay}\n\n`;
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

            // 💡 롱텀과 동일하게 IPv4 강제 옵션 주입
            await axios.post(url, payload, { httpsAgent: ipv4Agent });
            console.log(
              `[Scheduler] Sent short-term realtime signal for ${ticker} to chat ${chatId}`,
            );
          } catch (error: unknown) {
            TelegramShortTermService.sentSignalCache[cacheKey] =
              lastSentDate || "";

            // 💡 롱텀과 동일하게 에러 객체 통째로 출력되도록 개선
            console.error(`======================================`);
            console.error(
              `[Scheduler Error] Failed to send short-term signal to ${chatId}`,
            );
            console.error("RAW ERROR OBJECT:");
            console.error(error);
            console.error(`======================================`);
          }
        }
      });

      // 모든 비동기 전송 요청이 끝날 때까지 대기 (Promise.allSettled를 사용하여 일부 실패 시에도 전체 로직 보호)
      await Promise.allSettled(sendPromises);
    }
  }
}
