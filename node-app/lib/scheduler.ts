/* lib/scheduler.ts */

import cron from "node-cron";
import axios, { AxiosError } from "axios";
import path from "path";
import fs from "fs/promises";
import { LottoSet, LottoWeek } from "@/types/lotto";
import { getDrawNoForDate } from "./lottoUtils";
import stockConfig from "./stock.json";
import { TradingSignal } from "./stockUtils";

// NEW: Define the type for the enhanced signal object at the top level
type StockSignalInfo = {
  name: string;
  currentSignal: TradingSignal;
  lastMeaningfulSignal: TradingSignal | undefined;
};

// --- 1. 설정 (Configuration) ---
const config = {
  cacheDir: path.join(process.cwd(), ".cache"),
  lottoDbPath: path.join(process.cwd(), ".cache", "lotto.json"),
  apiBaseUrl: process.env.NEXTAUTH_URL || "http://localhost:3000", // Fallback for local dev
  kakao: {
    authUrl: "https://kauth.kakao.com/oauth/token",
    apiUrl: "https://kapi.kakao.com",
    clientId: process.env.KAKAO_CLIENT_ID,
    refreshToken: process.env.KAKAO_REFRESH_TOKEN,
    friendUuids:
      process.env.KAKAO_FRIEND_UUIDS?.split(",").map((s) => s.trim()) || [],
  },
  cronSchedules: {
    updateLottoWins: "0 9 * * 0", // 매주 일요일 오전 9시
    sendDailyLotto: "0 8 * * 5", // 매주 금요일 오전 8시
    sendDailyStockSignals: "0 9 * * *", // 매일 오전 9시
    generateAdvice: "0 8 * * 1-5", // 평일 오전 8시
    resetAdvice: "0 7 * * 1-5", // [NEW] 평일 오전 7시 리셋
  },
  notificationChunkSize: 3, // 한 번에 보낼 알림의 최대 개수
};

// --- Token Management Utilities (NEW) ---
const KAKAO_TOKEN_PATH = path.join(config.cacheDir, "kakao_tokens.json");

async function saveKakaoToken(tokens: {
  access_token?: string;
  refresh_token?: string;
}) {
  try {
    let currentData = {};
    try {
      // Ensure cache dir exists
      await fs.mkdir(config.cacheDir, { recursive: true });
      const fileContent = await fs.readFile(KAKAO_TOKEN_PATH, "utf8");
      currentData = JSON.parse(fileContent);
    } catch {
      // File might not exist yet, ignore
    }

    const newData = { ...currentData, ...tokens };
    await fs.writeFile(
      KAKAO_TOKEN_PATH,
      JSON.stringify(newData, null, 2),
      "utf8",
    );
    console.log("💾 Kakao tokens saved to cache file.");
  } catch (error) {
    console.error("❌ Failed to save Kakao tokens:", error);
  }
}

async function getSavedKakaoToken(): Promise<{
  access_token?: string;
  refresh_token?: string;
} | null> {
  try {
    const fileContent = await fs.readFile(KAKAO_TOKEN_PATH, "utf8");
    return JSON.parse(fileContent);
  } catch {
    return null;
  }
}

// --- Global Lock for Advice Generation ---
let isAdviceRunning = false;

// --- Exported Function for Manual Trigger ---
export async function generateDailyAdvice(): Promise<void> {
  if (isAdviceRunning) {
    console.log("⚠️ Advice generation is already running. Skipping trigger.");
    return;
  }

  isAdviceRunning = true;
  const usStocks = stockConfig.us_stocks;
  console.log(
    `🚀 Starting advice generation for ${usStocks.length} US stocks...`,
  );

  try {
    for (const stock of usStocks) {
      try {
        console.log(`Triggering advice generation for ${stock.ticker}...`);
        // Call the advice API endpoint.
        // [NEW] Capture response to check for cache status
        const response = await axios.post(`${config.apiBaseUrl}/api/advice`, {
          ticker: stock.ticker,
          apiType: "kisStock", // US stocks use kisStock apiType here
        });

        // [NEW] If advice was cached, skip the wait
        if (response.data && response.data.isCached) {
          console.log(
            `✅ [${stock.ticker}] Cached advice found. Skipping 1-minute wait.`,
          );
          continue;
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          `Failed to generate advice for ${stock.ticker}:`,
          axiosError.response?.data || axiosError.message,
        );
      }

      // Wait for 1 minute before the next request
      console.log("Waiting 1 minute before next request...");
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
    console.log("✅ Daily advice generation completed.");
  } finally {
    isAdviceRunning = false;
  }
}

// --- 2. 카카오 알림 서비스 (KakaoNotificationService) ---
class KakaoNotificationService {
  private accessToken: string | null = process.env.KAKAO_ACCESS_TOKEN || null;

  constructor() {
    // Attempt to load token from file on initialization if env is missing or potentially old
    this._initializeToken();
  }

  private async _initializeToken() {
    const saved = await getSavedKakaoToken();
    if (saved?.access_token) {
      this.accessToken = saved.access_token;
    }
  }

  private async _refreshAccessToken(): Promise<boolean> {
    console.log("카카오 Access Token 갱신을 시도합니다...");

    // [MODIFIED] Prioritize saved refresh token from file
    const savedTokens = await getSavedKakaoToken();
    const currentRefreshToken =
      savedTokens?.refresh_token || config.kakao.refreshToken;

    if (!currentRefreshToken || !config.kakao.clientId) {
      console.error("리프레시 토큰 또는 클라이언트 ID가 설정되지 않았습니다.");
      return false;
    }

    const data = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.kakao.clientId,
      refresh_token: currentRefreshToken,
    }).toString();

    try {
      const response = await axios.post(config.kakao.authUrl, data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });

      this.accessToken = response.data.access_token;

      // [MODIFIED] Save new tokens to file
      const newTokens: { access_token: string; refresh_token?: string } = {
        access_token: response.data.access_token,
      };

      if (response.data.refresh_token) {
        console.warn(
          "♻️ 새로운 Refresh Token이 발급되었습니다. 파일에 저장합니다.",
        );
        newTokens.refresh_token = response.data.refresh_token;
      }

      await saveKakaoToken(newTokens);
      console.log("✅ 카카오 Access Token 갱신 및 저장 성공!");

      return true;
    } catch (error) {
      console.error("❌ 카카오 Access Token 갱신 실패:", error);
      return false;
    }
  }

  private async _sendMessage(
    url: string,
    data: URLSearchParams,
    attempt = 1,
  ): Promise<void> {
    // If no access token yet, try to refresh first (which loads from file)
    if (!this.accessToken) {
      console.warn("Access Token이 없습니다. 토큰 갱신을 먼저 시도합니다.");
      const refreshed = await this._refreshAccessToken();
      if (!refreshed) {
        console.error("토큰 갱신 실패로 메시지를 보낼 수 없습니다.");
        return;
      }
    }

    try {
      console.log(`카카오 메시지 발송 시도: ${url}`);
      await axios.post(url, data.toString(), {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      console.log(`✅ 카카오 메시지 전송 성공: ${url}`);
    } catch (error) {
      const axiosError = error as AxiosError<{ code?: number }>;
      // -401: Invalid Token
      if (axiosError.response?.data?.code === -401 && attempt === 1) {
        console.warn("토큰 만료 감지 (-401). 갱신 후 재시도합니다.");
        if (await this._refreshAccessToken()) {
          await this._sendMessage(url, data, 2);
        }
      } else {
        console.error(
          "❌ 카카오 메시지 전송 최종 실패:",
          axiosError.response?.data || axiosError.message,
        );
      }
    }
  }

  public async notify(templateObject: object): Promise<void> {
    // 나에게 보내기
    const toMeUrl = `${config.kakao.apiUrl}/v2/api/talk/memo/default/send`;
    const toMeData = new URLSearchParams({
      template_object: JSON.stringify(templateObject),
    });
    await this._sendMessage(toMeUrl, toMeData);

    // 친구에게 보내기
    if (config.kakao.friendUuids.length > 0) {
      const toFriendsUrl = `${config.kakao.apiUrl}/v1/api/talk/friends/message/default/send`;
      const toFriendsData = new URLSearchParams({
        receiver_uuids: JSON.stringify(config.kakao.friendUuids),
        template_object: JSON.stringify(templateObject),
      });
      await this._sendMessage(toFriendsUrl, toFriendsData);
    }
  }

  public async notifyInChunks<T>(
    createTemplate: (chunk: T[]) => object,
    items: T[],
    chunkSize: number,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const template = createTemplate(chunk);
      await this.notify(template);
    }
  }

  // Template 생성 로직 (생략 - 기존 유지)
  public createLottoSetsTemplate =
    (drawNo: number) =>
    (sets: LottoSet[]): object => ({
      object_type: "list",
      header_title: `🎟️ ${drawNo}회차 로또 번호`,
      header_link: {
        web_url: `${config.apiBaseUrl}/lotto`,
        mobile_web_url: `${config.apiBaseUrl}/lotto`,
      },
      contents: sets.map((set, index) => ({
        title: `${index + 1}번째 조합`,
        description: set.numbers.join(", "),
        image_url: `${config.apiBaseUrl}/lotto.png`,
        link: {
          web_url: `${config.apiBaseUrl}/lotto`,
          mobile_web_url: `${config.apiBaseUrl}/lotto`,
        },
      })),
      buttons: [
        {
          title: "전체 번호 확인하기",
          link: {
            web_url: `${config.apiBaseUrl}/lotto`,
            mobile_web_url: `${config.apiBaseUrl}/lotto`,
          },
        },
      ],
    });

  // [MODIFIED] 메시지 포맷 변경: [종목] YYYY-MM-DD / 상태 (사유)
  public createStockStatusTemplate = (signals: StockSignalInfo[]): object => {
    return {
      object_type: "list",
      header_title: "🇺🇸 KIS 미국 주식 신호",
      header_link: {
        web_url: `${config.apiBaseUrl}/kis-stock`,
        mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
      },
      contents: signals.map((item) => {
        const { name, currentSignal, lastMeaningfulSignal } = item;
        const isHold = currentSignal.type === "hold";

        // 관망(hold) 상태라면 과거 신호를, 새로운 신호라면 현재 신호를 사용
        const targetSignal =
          isHold && lastMeaningfulSignal ? lastMeaningfulSignal : currentSignal;

        let statusText = "";

        // 상태 텍스트 결정 로직
        if (targetSignal.type === "buy") statusText = "매수";
        else if (targetSignal.type === "inverse-buy")
          statusText = "인버스 매수";
        else if (targetSignal.type === "sell") statusText = "수익 실현";

        // 현재 Hold 상태인데, 과거 신호가 매수/인버스 매수라면 '유지'를 붙임
        let isBuyHoldState = false;
        if (
          isHold &&
          (targetSignal.type === "buy" || targetSignal.type === "inverse-buy")
        ) {
          statusText += " 유지";
          isBuyHoldState = true;
        }

        // [NEW] If "Buy Hold" status, append "~" to the date
        const dateSuffix = isBuyHoldState ? " ~" : "";
        const title = `[${name}] ${targetSignal.date}${dateSuffix}`;
        const description = `${statusText} (${targetSignal.reason})`;

        return {
          title: title,
          description: description,
          image_url: `${config.apiBaseUrl}/lotto.png`,
          link: {
            web_url: `${config.apiBaseUrl}/kis-stock`,
            mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
          },
        };
      }),
      buttons: [
        {
          title: "KIS 주식 페이지로 이동",
          link: {
            web_url: `${config.apiBaseUrl}/kis-stock`,
            mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
          },
        },
      ],
    };
  };
}

// --- 3. 작업 스케줄러 (JobScheduler) ---
class JobScheduler {
  private kakaoService: KakaoNotificationService;

  constructor() {
    this.kakaoService = new KakaoNotificationService();
    this.initializeJobs();
  }

  private initializeJobs(): void {
    this._scheduleJob(
      "로또 당첨 번호 업데이트",
      config.cronSchedules.updateLottoWins,
      this._updateLottoWinningNumbers,
    );
    this._scheduleJob(
      "일일 로또 번호 발송",
      config.cronSchedules.sendDailyLotto,
      this._sendDailyLottoNumbers,
    );
    this._scheduleJob(
      "일일 주식 매매 신호 발송",
      config.cronSchedules.sendDailyStockSignals,
      this._sendDailyStockSignals,
    );
    this._scheduleJob(
      "일일 주식 조언 생성",
      config.cronSchedules.generateAdvice,
      generateDailyAdvice, // Use the exported function
    );
    // [NEW] Schedule advice reset
    this._scheduleJob(
      "평일 어드바이스 리셋",
      config.cronSchedules.resetAdvice,
      this._resetAdviceCache,
    );
  }

  private _scheduleJob(
    name: string,
    schedule: string,
    task: () => Promise<void>,
  ): void {
    cron.schedule(
      schedule,
      async () => {
        console.log(`[${name}] 작업을 시작합니다... (스케줄: ${schedule})`);
        try {
          await task.call(this);
          console.log(`[${name}] 작업이 성공적으로 완료되었습니다.`);
        } catch (error) {
          console.error(`[${name}] 작업 중 오류 발생:`, error);
        }
      },
      { timezone: "Asia/Seoul" },
    );
  }

  // [NEW] Advice Reset Logic
  private async _resetAdviceCache(): Promise<void> {
    const cachePath = path.join(config.cacheDir, "kis-stock-cache.json");
    try {
      console.log("🧹 Starting advice cache reset...");
      // Check if file exists first to avoid ENOENT
      try {
        await fs.access(cachePath);
      } catch {
        console.log("ℹ️ Cache file not found. Nothing to reset.");
        return;
      }

      const fileContent = await fs.readFile(cachePath, "utf-8");
      const cacheData = JSON.parse(fileContent);

      let resetCount = 0;
      for (const key in cacheData) {
        if (cacheData[key].advice) {
          cacheData[key].advice = null; // Clear the advice
          resetCount++;
        }
      }

      await fs.writeFile(
        cachePath,
        JSON.stringify(cacheData, null, 2),
        "utf-8",
      );
      console.log(
        `✅ Advice cache reset completed. Cleared ${resetCount} entries.`,
      );
    } catch (error) {
      console.error("❌ Failed to reset advice cache:", error);
    }
  }

  private async _updateLottoWinningNumbers(): Promise<void> {
    await axios.get(`${config.apiBaseUrl}/api/lotto/update-winning-numbers`);
  }

  private async _sendDailyLottoNumbers(): Promise<void> {
    const today = new Date();
    if (today.getDay() !== 5) {
      console.log(
        `[일일 로또 번호 발송] 오늘은 금요일이 아니므로 작업을 건너뜁니다.`,
      );
      return;
    }

    const lottoDb: Record<string, LottoWeek> = JSON.parse(
      await fs.readFile(config.lottoDbPath, "utf8"),
    );
    const currentDrawNo = getDrawNoForDate(new Date());
    const currentWeekData = Object.values(lottoDb).find(
      (w) => w.drawNo === currentDrawNo,
    );

    if (
      currentWeekData?.generatedSets &&
      currentWeekData.generatedSets.length > 0
    ) {
      console.log(
        `${currentDrawNo}회차 생성된 번호 ${currentWeekData.generatedSets.length}세트를 발송합니다.`,
      );
      const templateFn =
        this.kakaoService.createLottoSetsTemplate(currentDrawNo);
      await this.kakaoService.notifyInChunks(
        templateFn,
        currentWeekData.generatedSets,
        config.notificationChunkSize,
      );
    } else {
      console.log(
        `${currentDrawNo}회차에 해당하는 생성된 번호가 없어 발송을 건너뜁니다.`,
      );
    }
  }

  // [MODIFIED] 필터링 로직 강화: 완전한 관망(중립) 상태 제거
  private async _sendDailyStockSignals(): Promise<void> {
    const usStocks = stockConfig.us_stocks;
    const allLatestSignals: StockSignalInfo[] = [];

    for (const stock of usStocks) {
      try {
        const response = await axios.get(
          `${config.apiBaseUrl}/api/kisStock/${stock.ticker}`,
        );
        const { signals }: { signals: TradingSignal[] } = response.data;
        if (signals?.length > 0) {
          const currentSignal = signals.at(-1)!;
          const lastMeaningfulSignal = signals
            .filter((s) => s.type !== "hold")
            .at(-1);

          // 1. 과거 신호가 아예 없는 경우 (완전 초기 관망) -> 건너뛰기
          if (currentSignal.type === "hold" && !lastMeaningfulSignal) {
            continue;
          }

          // 2. 마지막 신호가 '수익 실현(sell)'이고 현재 관망(hold)인 경우 -> 중립 상태이므로 건너뛰기
          // (단, 오늘이 바로 수익 실현일이면 currentSignal.type이 'sell'이므로 아래 로직을 통과하여 알림 발송됨)
          if (
            currentSignal.type === "hold" &&
            lastMeaningfulSignal?.type === "sell"
          ) {
            console.log(
              `[${stock.ticker}] 알림 건너뛰기: 중립 구간 (마지막 신호: 수익 실현)`,
            );
            continue;
          }

          allLatestSignals.push({
            name: stock.ticker,
            currentSignal: currentSignal,
            lastMeaningfulSignal: lastMeaningfulSignal,
          });
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          `${stock.ticker} (KIS) 상태 확인 중 오류:`,
          axiosError.response?.data || axiosError.message,
        );
      }
    }

    if (allLatestSignals.length > 0) {
      console.log(
        `${allLatestSignals.length}개의 KIS 미국 주식 종목 상태를 확인하여 알림을 발송합니다.`,
      );
      await this.kakaoService.notifyInChunks(
        this.kakaoService.createStockStatusTemplate,
        allLatestSignals,
        config.notificationChunkSize,
      );
    } else {
      console.log(
        "알림을 보낼 KIS 미국 주식 종목이 없거나 데이터를 가져오는 데 실패했습니다.",
      );
    }
  }
}

// --- 4. 스케줄러 실행 (Singleton Pattern) ---
declare global {
  var isSchedulerRunning: boolean | undefined;
}

if (!global.isSchedulerRunning) {
  console.log(
    `🚀 스케줄러를 초기화합니다... (NODE_ENV: ${
      process.env.NODE_ENV || "unknown"
    })`,
  );
  new JobScheduler();
  global.isSchedulerRunning = true;
} else {
  console.log("ℹ️ 스케줄러가 이미 실행 중입니다.");
}
