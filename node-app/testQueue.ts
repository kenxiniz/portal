// testQueue.ts
// 실행 방법: npx ts-node testQueue.ts

import { getGeminiAdvice } from "./lib/geminiUtils";
import { TradingSignal, StockDataPoint } from "./lib/stockUtils";

// MODIFIED: price -> entryPrice 로 수정
const dummySignals: TradingSignal[] = [
  { date: "2024-01-01", type: "buy", reason: "골든크로스", entryPrice: 100 },
];

// RSI 속성 추가 (안전하게)
const dummyRecentData: StockDataPoint[] = [
  {
    date: "2024-01-01",
    close: 100,
    open: 90,
    high: 110,
    low: 90,
    volume: 1000,
    rsi: 50,
  },
];

async function runTest() {
  console.log("🚀 [테스트 시작] 3개의 요청을 '동시에' 보냅니다...");

  const startTime = Date.now();

  // 3개의 요청을 병렬로 생성
  const requests = [
    getGeminiAdvice(dummySignals, dummyRecentData, "AAPL", "us"),
    getGeminiAdvice(dummySignals, dummyRecentData, "TSLA", "us"),
    getGeminiAdvice(dummySignals, dummyRecentData, "GOOGL", "us"),
  ];

  // 로그 출력
  requests.forEach((req, index) => {
    req.then(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ 요청 ${index + 1} 완료! (경과 시간: ${elapsed}초)`);
    });
  });

  await Promise.all(requests);
  console.log("🏁 [테스트 종료] 모든 요청이 순차적으로 처리되었습니다.");
}

runTest().catch(console.error);
