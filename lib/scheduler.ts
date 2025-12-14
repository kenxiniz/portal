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

  private async _refreshAccessToken(): Promise<boolean> {
    console.log("카카오 Access Token 갱신을 시도합니다...");
    if (!config.kakao.refreshToken || !config.kakao.clientId) {
      console.error("리프레시 토큰 또는 클라이언트 ID가 설정되지 않았습니다.");
      return false;
    }

    const data = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.kakao.clientId,
      refresh_token: config.kakao.refreshToken,
    }).toString();

    try {
      const response = await axios.post(config.kakao.authUrl, data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });
      this.accessToken = response.data.access_token;
      console.log("✅ 카카오 Access Token 갱신 성공!");
      if (response.data.refresh_token) {
        console.warn(
          "⚠️ 새로운 Refresh Token이 발급되었습니다. 환경 변수를 업데이트해야 할 수 있습니다.",
        );
      }
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
    if (!this.accessToken) {
      console.error("카카오 Access Token이 없어 메시지를 보낼 수 없습니다.");
      return;
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
      if (axiosError.response?.data?.code === -401 && attempt === 1) {
        console.warn("토큰 만료 감지. 갱신 후 재시도합니다.");
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

  public createStockStatusTemplate = (signals: StockSignalInfo[]): object => {
    const formatPrice = (price: number | undefined): string => {
      if (price === undefined || price === null) return "가격 정보 없음";
      return `$${price.toFixed(2)}`;
    };

    const getSignalText = (signal: TradingSignal): string => {
      switch (signal.type) {
        case "buy":
          return `매수 (${formatPrice(signal.entryPrice)})`;
        case "inverse-buy":
          return `인버스 매수 (${formatPrice(signal.entryPrice)})`;
        case "sell":
          return `수익 실현 (${formatPrice(signal.realizedPrice)})`;
        case "hold":
        default:
          return signal.reason;
      }
    };

    return {
      object_type: "list",
      header_title: "🇺🇸 KIS 미국 주식 신호",
      header_link: {
        web_url: `${config.apiBaseUrl}/kis-stock`,
        mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
      },
      contents: signals.map((item) => {
        const { name, currentSignal, lastMeaningfulSignal } = item;

        let title = `[${name}] ${getSignalText(currentSignal)}`;
        let description = `신호 발생일: ${currentSignal.date}`;

        if (
          lastMeaningfulSignal &&
          lastMeaningfulSignal.date !== currentSignal.date
        ) {
          title = `[${name}] ${getSignalText(currentSignal)}`;
          description = `최근 신호: ${getSignalText(lastMeaningfulSignal)} (${
            lastMeaningfulSignal.date
          })`;
        } else if (!lastMeaningfulSignal) {
          title = `[${name}] ${getSignalText(currentSignal)}`;
          description = "최근 1년간 매매 신호 없음";
        }

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

          if (lastMeaningfulSignal && lastMeaningfulSignal.type === "sell") {
            console.log(
              `[${stock.ticker}] 알림 건너뛰기: 마지막 신호가 '수익 실현(sell)'입니다.`,
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
