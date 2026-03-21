import path from "path";

export const schedulerConfig = {
  cacheDir: path.join(process.cwd(), ".cache"),
  lottoDbPath: path.join(process.cwd(), ".cache", "lotto.json"),
  apiBaseUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
  kakao: {
    authUrl: "https://kauth.kakao.com/oauth/token",
    apiUrl: "https://kapi.kakao.com",
    clientId: process.env.KAKAO_CLIENT_ID,
    refreshToken: process.env.KAKAO_REFRESH_TOKEN,
    friendUuids: process.env.KAKAO_FRIEND_UUIDS?.split(",").map((s) => s.trim()) || [],
  },
  cronSchedules: {
    updateLottoWins: "0 9 * * 0",
    sendDailyLotto: "0 8 * * 5",
    sendDailyStockSignals: "0 9 * * *",
    generateAdvice: "0 8 * * 1-5",
    resetAdvice: "0 7 * * 1-5",
  },
  notificationChunkSize: 3,
};
