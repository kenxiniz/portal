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

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
  },
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
  task: () => Promise<Record<string, AdviceObject>>;
  resolve: (
    value:
      | Record<string, AdviceObject>
      | PromiseLike<Record<string, AdviceObject>>,
  ) => void;
}

const requestQueue: QueueItem[] = [];
let isProcessing = false;
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
      console.error("[ERROR] Queue processing error:", error);
      item.resolve({});
    }
  }

  if (requestQueue.length > 0) {
    console.log(`[INFO] Waiting ${REQUEST_INTERVAL}ms before next request...`);
    await sleep(REQUEST_INTERVAL);
  }

  isProcessing = false;
  processQueue();
}

// --- GLOBAL QUEUE SYSTEM END ---

export interface BatchInputItem {
  ticker: string;
  stockName?: string;
  signals: TradingSignal[];
  recentStockData: StockDataPoint[];
}

async function performBatchGeminiCall(
  items: BatchInputItem[],
  market: "kr" | "us",
): Promise<Record<string, AdviceObject>> {
  if (items.length === 0) return {};

  console.log(`[INFO] PROCESSING BATCH API CALL for ${items.length} stocks.`);

  const marketContext = market === "us" ? "US Stocks" : "Korean Stocks";
  const now = new Date();
  const todayString = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  let dataPayload = "";
  items.forEach((item) => {
    const keySignals = item.signals.filter((s) => s.type !== "hold");
    const signalsString =
      keySignals.length > 0
        ? keySignals
            .map((s) => {
              let signalDesc = `[${s.date}] ${s.reason}`;
              if (s.type === "sell" && s.profitRate !== undefined) {
                signalDesc += ` (Return: ${s.profitRate.toFixed(2)}%)`;
              } else if (s.type.includes("buy") && s.entryPrice) {
                signalDesc += ` (Entry: ${s.entryPrice})`;
              }
              return signalDesc;
            })
            .join("\n")
        : "No significant trading signals in the past year";

    const formattedRecentData = item.recentStockData.map((d) => ({
      date: d.date,
      close: d.close,
      rsi: d.rsi ? parseFloat(d.rsi.toFixed(2)) : null,
    }));

    dataPayload += `\n### Ticker Key: ${item.ticker}\n`;
    if (item.stockName) dataPayload += `Stock Name: ${item.stockName}\n`;
    dataPayload += `Recent 7 Days Data:\n${JSON.stringify(formattedRecentData, null, 2)}\n`;
    dataPayload += `Recent 1 Year Signals:\n${signalsString}\n`;
  });

  const prompt = `
You are an expert ${marketContext} analyst.
Analyze the provided data for multiple stocks and generate investment advice for each.
Date: ${todayString}

REQUIREMENTS:
1. You MUST return a valid JSON object.
2. The root JSON keys must be the exact "Ticker Key" provided for each stock.
3. The JSON values must be the generated advice string in Korean.
4. Each advice string format MUST exactly follow this structure:
[${todayString} 기준]
**One-line summary in bold**
- Detailed analysis bullet 1
- Detailed analysis bullet 2
5. Do not include any markdown code blocks (like \`\`\`json) or any other text outside the JSON object.

EXAMPLE OUTPUT FORMAT:
{
  "AAPL": "[${todayString} 기준]\\n**단기 상승 추세, 매수 유지**\\n- 최근 7일간 RSI가 50에서 65로 꾸준히 상승하며 매수세가 유입되고 있습니다.\\n- 150달러 부근의 지지선을 확인한 후 반등하는 모습을 보이고 있어 긍정적입니다.",
  "TSLA": "[${todayString} 기준]\\n**변동성 확대 예상, 관망 추천**\\n- 거래량이 급증하며 주가 등락폭이 커지고 있어 단기적인 주의가 필요합니다.\\n- 과거 매수 신호 발생 이후 추가 상승 동력이 다소 부족한 상태입니다."
}

STOCK DATA TO ANALYZE:
${dataPayload}
`;

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim() === "") {
        throw new Error("AI returned empty response");
      }

      const parsedResult = JSON.parse(text);
      const finalResult: Record<string, AdviceObject> = {};

      for (const key of Object.keys(parsedResult)) {
        finalResult[key] = { error: false, message: parsedResult[key] };
      }

      console.log(`[INFO] Batch Gemini advice generated successfully.`);
      return finalResult;
    } catch (e: unknown) {
      attempt++;
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      console.error(
        `[ERROR] Gemini API Error (Attempt ${attempt}/${maxRetries}): ${errorMessage}`,
      );

      if (
        errorMessage.includes("PerDay") ||
        errorMessage.includes("QuotaFailure")
      ) {
        console.error(`[ERROR] DAILY QUOTA EXCEEDED. Stopping retries.`);
        const errorRes: Record<string, AdviceObject> = {};
        items.forEach((item) => {
          errorRes[item.ticker] = {
            error: true,
            message: "Gemini API 일일 사용량 초과 (내일 다시 시도하세요)",
          };
        });
        return errorRes;
      }

      if (
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests")
      ) {
        if (attempt < maxRetries) {
          console.warn(`[WARN] Rate limit hit. Waiting 60s...`);
          await sleep(60000);
          continue;
        }
      }

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

      if (attempt === maxRetries) {
        const finalErrorRes: Record<string, AdviceObject> = {};
        items.forEach((item) => {
          finalErrorRes[item.ticker] = {
            error: true,
            message: `Gemini API 오류: ${errorMessage}`,
          };
        });
        return finalErrorRes;
      }
    }
  }

  const failRes: Record<string, AdviceObject> = {};
  items.forEach((item) => {
    failRes[item.ticker] = {
      error: true,
      message: "Gemini API 오류: 최대 재시도 횟수 초과",
    };
  });
  return failRes;
}

export async function getBatchGeminiAdvice(
  items: BatchInputItem[],
  market: "kr" | "us",
): Promise<Record<string, AdviceObject>> {
  console.log(
    `[INFO] Queuing batch Gemini request for ${items.length} items...`,
  );
  return new Promise<Record<string, AdviceObject>>((resolve) => {
    requestQueue.push({
      task: () => performBatchGeminiCall(items, market),
      resolve,
    });
    processQueue();
  });
}
