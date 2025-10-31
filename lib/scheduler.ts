/* lib/scheduler.ts */

import cron from "node-cron";
import axios, { AxiosError } from "axios";
import path from "path";
import fs from "fs/promises";
import { LottoSet, LottoWeek } from "@/types/lotto";
import { getDrawNoForDate } from "./lottoUtils";
import stockConfig from "./stock.json";
import { TradingSignal } from "./stockUtils";

// --- 1. 설정 (Configuration) ---
const config = {
  cacheDir: path.join(process.cwd(), ".cache"),
  lottoDbPath: path.join(process.cwd(), ".cache", "lotto.json"),
  apiBaseUrl: process.env.NEXTAUTH_URL,
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
    // ✅ [수정] "0 8 * * *" (매일 오전 8시) -> "0 8 * * 5" (금요일 오전 8시)
    sendDailyLotto: "0 8 * * 5", // 매주 금요일 오전 8시
    sendDailyStockSignals: "0 9 * * *", // 매일 오전 9시 (이 스케줄은 유지)
  },
  notificationChunkSize: 3, // 한 번에 보낼 알림의 최대 개수
};

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

  // Template 생성 로직은 KakaoNotificationService 내부 책임
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

  public createStockStatusTemplate = (
    signals: { name: string; signal: TradingSignal }[],
  ): object => ({
    object_type: "list",
    // ✅ [수정] 헤더 타이틀 변경
    header_title: "🇺🇸 KIS 미국 주식 신호",
    header_link: {
      // ✅ [수정] kis-stock 페이지로 링크
      web_url: `${config.apiBaseUrl}/kis-stock`,
      mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
    },
    contents: signals.map((item) => ({
      title: `[${item.name}] ${item.signal.reason}`,
      description: item.signal.details || `현재 상태: ${item.signal.type}`,
      image_url: `${config.apiBaseUrl}/lotto.png`, // TODO: 적절한 아이콘으로 변경
      link: {
        // ✅ [수정] kis-stock 페이지로 링크
        web_url: `${config.apiBaseUrl}/kis-stock`,
        mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
      },
    })),
    buttons: [
      {
        // ✅ [수정] 버튼 텍스트 변경
        title: "KIS 주식 페이지로 이동",
        link: {
          // ✅ [수정] kis-stock 페이지로 링크
          web_url: `${config.apiBaseUrl}/kis-stock`,
          mobile_web_url: `${config.apiBaseUrl}/kis-stock`,
        },
      },
    ],
  });
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
      config.cronSchedules.sendDailyLotto, // This now uses the updated schedule
      this._sendDailyLottoNumbers,
    );
    this._scheduleJob(
      "일일 주식 매매 신호 발송",
      config.cronSchedules.sendDailyStockSignals,
      this._sendDailyStockSignals,
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

  private async _updateLottoWinningNumbers(): Promise<void> {
    await axios.get(`${config.apiBaseUrl}/api/lotto/update-winning-numbers`);
  }

  private async _sendDailyLottoNumbers(): Promise<void> {
    // Check if today is Friday (cron schedule handles this, but as a safeguard)
    const today = new Date();
    if (today.getDay() !== 5) {
      // 0=Sunday, 1=Monday, ..., 5=Friday
      console.log(
        `[일일 로또 번호 발송] 오늘은 금요일이 아니므로 작업을 건너뜁니다.`,
      );
      return; // Skip if not Friday
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
    const usStocks = stockConfig.us_stocks; // Iterate over us_stocks list
    const allLatestSignals: { name: string; signal: TradingSignal }[] = [];

    for (const stock of usStocks) {
      try {
        // ✅ [수정] KIS 미국 주식 API 엔드포인트 사용
        const response = await axios.get(
          `${config.apiBaseUrl}/api/kisStock/${stock.ticker}`,
        );
        const { signals }: { signals: TradingSignal[] } = response.data;
        if (signals?.length > 0) {
          allLatestSignals.push({
            name: stock.ticker,
            signal: signals.at(-1)!,
          });
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(
          `${stock.ticker} (KIS) 상태 확인 중 오류:`, // ✅ [수정] 로그에 KIS 명시
          axiosError.response?.data || axiosError.message,
        );
      }
    }

    if (allLatestSignals.length > 0) {
      console.log(
        `${allLatestSignals.length}개의 KIS 미국 주식 종목 상태를 확인하여 알림을 발송합니다.`, // ✅ [수정] 로그 메시지 변경
      );
      const template =
        this.kakaoService.createStockStatusTemplate(allLatestSignals);
      await this.kakaoService.notify(template);
    } else {
      console.log(
        "조회할 KIS 미국 주식 종목이 없거나 데이터를 가져오는 데 실패했습니다.", // ✅ [수정] 로그 메시지 변경
      );
    }
  }
}

// --- 4. 스케줄러 실행 (Singleton Pattern) ---
declare global {
  var isSchedulerRunning: boolean | undefined;
}

// Keep the existing startup logic from the file
console.log("🚀 프로덕션 환경에서 스케줄러를 초기화합니다...");
new JobScheduler();
global.isSchedulerRunning = true;

/*
if (process.env.NODE_ENV === 'production' && !global.isSchedulerRunning) {
  console.log('🚀 프로덕션 환경에서 스케줄러를 초기화합니다...');
  new JobScheduler();
  global.isSchedulerRunning = true;
} else if (process.env.NODE_ENV !== 'production') {
  console.log('ℹ️ 개발 환경에서는 스케줄러가 자동으로 실행되지 않습니다.');
} else {
  console.log('ℹ️ 스케줄러가 이미 실행 중입니다.');
}
*/
