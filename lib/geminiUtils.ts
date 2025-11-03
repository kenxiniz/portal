/* /lib/geminiUtils.ts */

// MODIFIED: Import GoogleGenerativeAI and Harm types
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
// MODIFIED: Import StockDataPoint
import { AdviceObject, TradingSignal, StockDataPoint } from "./stockUtils"; // Import necessary types

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  // MODIFIED: Throw an error instead of just logging
  throw new Error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
// MODIFIED: Updated to a specific model and added safety settings
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-pro", // MODIFIED: Changed model name as requested by user
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
});

/**
 * Fetches investment advice from the Gemini API based on technical signals.
 * Uses fetch API with header authentication.
 * @param signals - Array of technical trading signals.
 * @param recentStockData - Array of the last 7 days of stock data.
 * @param ticker - The stock ticker symbol.
 * @param market - The market type ('us' or 'kr').
 * @param stockName - (Optional) The name of the stock (used for kr market).
 * @returns {Promise<AdviceObject>} An object containing error status and the advice message or error details.
 */
// MODIFIED: Function signature now accepts recentStockData
export async function getGeminiAdvice(
  signals: TradingSignal[],
  recentStockData: StockDataPoint[], // NEW: Added recent stock data
  ticker: string,
  market: "kr" | "us",
  stockName?: string,
): Promise<AdviceObject> {
  const identifier =
    market === "kr" && stockName ? `${ticker} - ${stockName}` : ticker;
  console.log(
    `🤖 [${identifier}] ENTERING getGeminiAdvice function (using genAI.generateContent).`,
  ); // Log entry with identifier

  // Filter for key signals (non-hold)
  const keySignals = signals.filter((s) => s.type !== "hold");

  // Format the signals for the prompt
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

  // NEW: Format the recent stock data
  const formattedRecentData = recentStockData.map((d) => ({
    date: d.date,
    close: d.close, // Keep as number
    rsi: d.rsi ? parseFloat(d.rsi.toFixed(2)) : null, // Format RSI
  }));
  const recentDataString = JSON.stringify(formattedRecentData, null, 2);

  // --- Create Korean Prompt regardless of market type ---
  let marketContext = "";
  let stockIdentifier = "";

  if (market === "us") {
    marketContext = "미국 주식";
    stockIdentifier = ticker; // Use ticker for US stocks
  } else if (market === "kr") {
    marketContext = "한국 주식";
    stockIdentifier = `${stockName || ticker}(종목코드: ${ticker})`; // Use name and ticker for KR stocks
  }

  // MODIFIED: Updated prompt to include recent data
  const prompt = `
당신은 전문 ${marketContext} 애널리스트입니다.
${stockIdentifier} 주식에 대한 투자 조언을 생성해주세요.

**최근 1주일 가격 및 RSI 데이터:**
${recentDataString}

**최근 1년간의 주요 매매 신호:**
${signalsString}

**요구사항:**
1.  위에 제공된 **최근 1주일 데이터**와 **최근 1년 매매 신호**를 모두 조합하여 분석합니다.
2.  분석을 기반으로 투자 의견을 **한국어**로 간결하게 제공합니다.
3.  응답은 2-3개의 핵심 불렛포인트(bullet point)로 요약하고, 그 전에 한 문장으로 된 굵은 글씨의 요약(예: "**단기 하락 추세, 관망 필요**")을 먼저 제시해야 합니다.
4.  다른 설명 없이 요약과 불렛포인트만 제공해주세요.
`;
  // --- End Prompt Creation ---

  console.log(`[${identifier}] Generating advice with the following prompt:`);
  console.log(prompt);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    // NEW: Handle blocked responses
    if (response.promptFeedback?.blockReason) {
      const blockReason = response.promptFeedback.blockReason;
      console.warn(
        `[${identifier}] Gemini API Warning: Response blocked due to ${blockReason}`,
      );
      return {
        error: true,
        message: `AI 조언 생성 불가: ${blockReason}`,
      };
    }

    const text = response.text();

    if (!text || text.trim() === "") {
      console.warn(
        `[${identifier}] Gemini API Warning: Received empty text response.`,
      );
      return {
        error: true,
        message: "AI 조언 생성 불가: 빈 응답",
      };
    }

    // Success case
    console.log(`✅ [${identifier}] Gemini advice generated successfully.`); // Log success
    return { error: false, message: text.trim() };
  } catch (e: unknown) {
    const errorMessage =
      e instanceof Error ? e.message : "An unknown error occurred";
    console.error(`[${identifier}] Gemini API Error:`, errorMessage);
    // Return a structured error object
    return {
      error: true,
      message: `Gemini API 오류: ${errorMessage}`,
    };
  }
}
