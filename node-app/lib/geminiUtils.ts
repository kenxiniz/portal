/* /lib/geminiUtils.ts */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { AdviceObject, TradingSignal, StockDataPoint } from "./stockUtils";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(API_KEY);

/**
 * ✅ 모델 변경: gemini-2.5-flash (하루 20회 제한) -> gemini-2.0-flash (대용량 쿼터)
 * 제공해주신 리스트에 있는 'gemini-2.0-flash'를 사용합니다.
 */
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- GLOBAL QUEUE SYSTEM START ---

interface QueueItem {
  task: () => Promise<AdviceObject>;
  resolve: (value: AdviceObject | PromiseLike<AdviceObject>) => void;
}

const requestQueue: QueueItem[] = [];
let isProcessing = false;
// 2.0 Flash는 속도가 빠르므로 간격을 4초로 설정 (안정성 확보)
const REQUEST_INTERVAL = 4000;

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;
  const item = requestQueue.shift();

  if (item) {
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      console.error("Queue processing error:", error);
      item.resolve({
        error: true,
        message: "요청 처리 중 대기열 오류 발생",
      });
    }
  }

  // 요청 처리 후 대기 (Rate Limiting)
  if (requestQueue.length > 0) {
    console.log(`⏳ Waiting ${REQUEST_INTERVAL}ms before next request...`);
    await sleep(REQUEST_INTERVAL);
  }

  isProcessing = false;
  processQueue();
}

// --- GLOBAL QUEUE SYSTEM END ---

async function performGeminiCall(
  signals: TradingSignal[],
  recentStockData: StockDataPoint[],
  ticker: string,
  market: "kr" | "us",
  stockName?: string,
): Promise<AdviceObject> {
  const identifier =
    market === "kr" && stockName ? `${ticker} - ${stockName}` : ticker;
  console.log(`🤖 [${identifier}] PROCESSING API CALL (Queue Executed).`);

  const keySignals = signals.filter((s) => s.type !== "hold");
  const signalsString =
    keySignals.length > 0
      ? keySignals
          .map((s) => {
            let signalDesc = `[${s.date}] ${s.reason}`;
            if (s.type === "sell" && s.profitRate !== undefined) {
              signalDesc += ` (수익률: ${s.profitRate.toFixed(2)}%)`;
            } else if (s.type.includes("buy") && s.entryPrice) {
              signalDesc += ` (진입가: ${s.entryPrice})`;
            }
            return signalDesc;
          })
          .join("\n")
      : "최근 1년 간 유의미한 매매 신호 없음";

  const formattedRecentData = recentStockData.map((d) => ({
    date: d.date,
    close: d.close,
    rsi: d.rsi ? parseFloat(d.rsi.toFixed(2)) : null,
  }));
  const recentDataString = JSON.stringify(formattedRecentData, null, 2);

  let marketContext = "";
  let stockIdentifier = "";

  if (market === "us") {
    marketContext = "미국 주식";
    stockIdentifier = ticker;
  } else if (market === "kr") {
    marketContext = "한국 주식";
    stockIdentifier = `${stockName || ticker}(종목코드: ${ticker})`;
  }

  // Get current date for the prompt
  const now = new Date();
  const todayString = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  // Modified Prompt: Added instruction to include the date
  const prompt = `
당신은 전문 ${marketContext} 애널리스트입니다.
${stockIdentifier} 주식에 대한 투자 조언을 생성해주세요.

**작성 기준일:** ${todayString}

**최근 1주일 가격 및 RSI 데이터:**
${recentDataString}

**최근 1년간의 주요 매매 신호:**
${signalsString}

**요구사항:**
1.  위에 제공된 **최근 1주일 데이터**와 **최근 1년 매매 신호**를 모두 조합하여 분석합니다.
2.  분석을 기반으로 투자 의견을 **한국어**로 간결하게 제공합니다.
3.  **응답의 가장 첫 줄에 "[${todayString} 기준]"이라고 작성일을 명시해주세요.**
4.  그 다음 줄에 한 문장으로 된 굵은 글씨의 요약(예: "**단기 하락 추세, 관망 필요**")을 제시하세요.
5.  그 아래에 2-3개의 핵심 불렛포인트(bullet point)로 상세 내용을 요약하세요.
6.  다른 설명 없이 위 형식(날짜, 요약, 불렛포인트)만 제공해주세요.
`;

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim() === "") {
        return { error: true, message: "AI 조언 생성 불가: 빈 응답" };
      }

      console.log(`✅ [${identifier}] Gemini advice generated successfully.`);
      return { error: false, message: text.trim() };
    } catch (e: unknown) {
      attempt++;
      const errorMessage =
        e instanceof Error ? e.message : "An unknown error occurred";

      console.error(
        `[${identifier}] Gemini API Error (Attempt ${attempt}/${maxRetries}): ${errorMessage}`,
      );

      // --- 에러 처리 로직 ---

      // 1. 일일 쿼터 초과 (PerDay) -> 재시도 해도 소용없음. 즉시 종료.
      if (
        errorMessage.includes("PerDay") ||
        errorMessage.includes("QuotaFailure")
      ) {
        console.error(
          `❌ [${identifier}] DAILY QUOTA EXCEEDED (2.0-flash). Stopping retries.`,
        );
        return {
          error: true,
          message: "Gemini API 일일 사용량 초과 (내일 다시 시도하세요)",
        };
      }

      // 2. 일시적 속도 제한 (429) -> 60초 대기 후 재시도
      if (
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests")
      ) {
        if (attempt < maxRetries) {
          console.warn(`🛑 [${identifier}] Rate limit hit. Waiting 60s...`);
          await sleep(60000); // 1분 대기
          continue;
        }
      }

      // 3. 서버 과부하 (503) -> 짧게 대기 후 재시도
      if (
        errorMessage.includes("503") ||
        errorMessage.includes("Service Unavailable")
      ) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await sleep(delay);
          continue;
        }
      }

      return {
        error: true,
        message: `Gemini API 오류: ${errorMessage}`,
      };
    }
  }

  return {
    error: true,
    message: "Gemini API 오류: 최대 재시도 횟수 초과",
  };
}

export async function getGeminiAdvice(
  signals: TradingSignal[],
  recentStockData: StockDataPoint[],
  ticker: string,
  market: "kr" | "us",
  stockName?: string,
): Promise<AdviceObject> {
  const identifier = stockName || ticker;
  console.log(`🕒 [${identifier}] Queuing Gemini request...`);

  return new Promise<AdviceObject>((resolve) => {
    requestQueue.push({
      task: () =>
        performGeminiCall(signals, recentStockData, ticker, market, stockName),
      resolve,
    });
    processQueue();
  });
}
