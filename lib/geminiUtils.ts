/* lib/geminiUtils.ts */

import { AdviceObject, TradingSignal } from "./stockUtils"; // Import necessary types

// Define possible market types
type MarketType = "us" | "kr";

/**
 * Fetches investment advice from the Gemini API based on technical signals.
 * Uses fetch API with header authentication.
 * @param signals - Array of technical trading signals.
 * @param ticker - The stock ticker symbol.
 * @param market - The market type ('us' or 'kr').
 * @param stockName - (Optional) The name of the stock (used for kr market).
 * @returns {Promise<AdviceObject>} An object containing error status and the advice message or error details.
 */
export async function getGeminiAdvice(
  signals: TradingSignal[],
  ticker: string,
  market: MarketType,
  stockName?: string, // Optional, but needed for 'kr'
): Promise<AdviceObject> {
  const identifier =
    market === "kr" && stockName ? `${ticker} - ${stockName}` : ticker;
  console.log(
    `🤖 [${identifier}] ENTERING getGeminiAdvice function (using fetch).`,
  ); // Log entry with identifier

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    const errorMsg = "API 키가 설정되지 않았습니다.";
    console.error(`[${identifier}] GEMINI_API_KEY is not set.`);
    return { error: true, message: `조언 생성 불가: ${errorMsg}` };
  }

  // Use the specific model name requested from model list
  const modelName = "gemini-2.5-pro"; // Using gemini-2.5-pro
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  // --- Create Korean Prompt regardless of market type ---
  let marketContext = "";
  let stockIdentifier = "";

  if (market === "us") {
    marketContext = "미국 주식";
    stockIdentifier = ticker; // Use ticker for US stocks
  } else if (market === "kr") {
    marketContext = "한국 주식";
    stockIdentifier = `${stockName || ticker}(종목코드: ${ticker})`; // Use name and ticker for KR stocks
  } else {
    const errorMsg = "Invalid market type provided.";
    console.error(`[${identifier}] Invalid market type: ${market}`);
    return { error: true, message: `조언 생성 불가: ${errorMsg}` };
  }

  // Unified Korean prompt
  const prompt = `
      너는 전문 ${marketContext} 애널리스트이다.
      ${stockIdentifier} 주식의 최근 기술적 분석 신호가 다음과 같아:
      ${JSON.stringify(signals, null, 2)}

      이 신호들을 바탕으로, 개인 투자자를 위한 명확하고 간결한 투자 조언을 한국어로 5-6문장 작성해줘.
      현재 추세(상승/하락/횡보)와 주요 신호(예: 과매수, 골든 크로스 등)를 언급하고,
      '매수', '매도', '관망' 중 하나의 의견을 제시해줘.
      그리고 최근 수익, 손실에 대한 평가도 추가해줘.
    `;
  // --- End Prompt Creation ---

  // --- Log the generated prompt ---
  console.log(`[${identifier}] Generating advice with the following prompt:`);
  console.log(prompt);
  // --- End of new log ---

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    // --- Safety settings thresholds set to BLOCK_NONE ---
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    ],
  };

  try {
    console.log(`[${identifier}] Calling Gemini API via fetch: ${apiUrl}`); // Log API call start
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY, // Send API key in header
      },
      body: JSON.stringify(requestBody),
    });
    console.log(
      `[${identifier}] Gemini API fetch finished. Status: ${response.status}`,
    ); // Log API call end status

    // More detailed error handling for non-ok responses
    if (!response.ok) {
      const errorBodyText = await response.text(); // Use const
      // Define type for errorBodyJson
      let errorBodyJson: { error?: { message?: string } } = {};
      try {
        errorBodyJson = JSON.parse(errorBodyText); // Try parsing as JSON
      } catch {
        console.error(
          `[${identifier}] Gemini API Error: Failed to parse error response body as JSON. Body Text:`,
          errorBodyText,
        );
      }
      const errorMsg = `API 요청 실패 (${response.status} ${response.statusText}). 응답 본문: ${errorBodyText}`;
      console.error(`[${identifier}] Gemini API Error Full: ${errorMsg}`);
      // Extract specific message if available, fall back to statusText or generic message
      // Define type for the error structure
      interface ApiError {
        error?: { message?: string };
      }
      const apiErrorMessage =
        (errorBodyJson as ApiError)?.error?.message ||
        response.statusText ||
        "알 수 없는 API 오류"; // Use ApiError type
      return { error: true, message: `AI 조언 생성 오류: ${apiErrorMessage}` };
    }

    const result = await response.json();
    console.log(
      `[${identifier}] Full Gemini API response object:`,
      JSON.stringify(result, null, 2),
    ); // Log full response prettified

    // Extract text, checking structure carefully
    const candidate = result?.candidates?.[0];
    const adviceText = candidate?.content?.parts?.[0]?.text;
    // Improved check for finishReason and safetyRatings
    const finishReason = candidate?.finishReason;
    const safetyRatings = candidate?.safetyRatings;
    let blockReasonDetail = null;

    if (
      finishReason === "SAFETY" &&
      safetyRatings &&
      safetyRatings.length > 0
    ) {
      // Find the first blocked category
      // Add basic type for safetyRating
      interface SafetyRating {
        category: string;
        probability: string;
        blocked?: boolean;
      }
      const blockedRating = safetyRatings.find((r: SafetyRating) => r.blocked); // Use type
      blockReasonDetail = blockedRating
        ? `${blockedRating.category} (Probability: ${blockedRating.probability})`
        : "Safety Block";
      console.warn(
        `[${identifier}] Gemini API Warning: Response blocked due to SAFETY. Details:`,
        JSON.stringify(safetyRatings),
      ); // Log safety ratings
    } else if (finishReason && finishReason !== "STOP") {
      blockReasonDetail = `Finish Reason: ${finishReason}`;
      console.warn(
        `[${identifier}] Gemini API Warning: Non-STOP Finish Reason - ${finishReason}`,
      ); // Log other finish reasons
    }

    if (blockReasonDetail) {
      return {
        error: true,
        message: `AI 조언 생성 불가: ${blockReasonDetail}`,
      };
    }

    console.log(
      `[${identifier}] Gemini raw response text extracted: "${adviceText}"`,
    ); // Log extracted text

    if (
      adviceText === undefined ||
      adviceText === null ||
      adviceText.trim() === ""
    ) {
      // Check more thoroughly for empty/null/undefined
      const errorMsg = "응답에서 유효한 텍스트를 찾을 수 없습니다.";
      console.warn(
        `[${identifier}] Gemini API Warning: Could not extract valid text from response. Extracted:`,
        adviceText,
      ); // Log what was extracted
      return { error: true, message: `조언 생성 불가: ${errorMsg}` };
    }

    // Success case
    console.log(
      `✅ [${identifier}] Gemini advice generated successfully via fetch.`,
    ); // Log success
    return { error: false, message: adviceText };
  } catch (error) {
    console.error(`[${identifier}] Gemini API Error during fetch call:`, error); // Log fetch-specific errors
    let detailedErrorMessage = "네트워크 또는 알 수 없는 오류";
    if (error instanceof Error) {
      detailedErrorMessage = error.message;
      console.error(
        `[${identifier}] Gemini Specific Error Parsed: ${detailedErrorMessage}`,
      );
    } else {
      console.error(
        `[${identifier}] Gemini Non-standard error object during fetch:`,
        error,
      );
    }
    // Return error object in catch block
    return {
      error: true,
      message: `AI 조언 생성 중 오류: ${detailedErrorMessage}`,
    };
  }
}
