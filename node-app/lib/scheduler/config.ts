import path from "path";

export const schedulerConfig = {
  cacheDir: path.join(process.cwd(), ".cache"),
  lottoDbPath: path.join(process.cwd(), ".cache", "lotto.json"),
  apiBaseUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
  cronSchedules: {
    updateLottoWins: "0 9 * * 0",
    sendDailyLotto: "0 8 * * 5",
    sendDailyStockSignals: "0 9 * * *",
    generateAdvice: "0 8 * * 1-5",
    resetAdvice: "0 7 * * 1-5",
    collectMarketData: "*/5 * * * *",
    awsSecurity: "0 7,19 * * *",
  },
  notificationChunkSize: 3,
};
