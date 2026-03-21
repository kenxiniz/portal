import axios, { AxiosError } from "axios";
import path from "path";
import fs from "fs/promises";
import { schedulerConfig } from "./config";
import { StockSignalInfo } from "./types";
import { LottoSet } from "@/types/lotto";

const KAKAO_TOKEN_PATH = path.join(schedulerConfig.cacheDir, "kakao_tokens.json");

async function saveKakaoToken(tokens: { access_token?: string; refresh_token?: string }) {
  try {
    let currentData = {};
    try {
      await fs.mkdir(schedulerConfig.cacheDir, { recursive: true });
      const fileContent = await fs.readFile(KAKAO_TOKEN_PATH, "utf8");
      currentData = JSON.parse(fileContent);
    } catch {
      // Ignore if file does not exist
    }

    const newData = { ...currentData, ...tokens };
    await fs.writeFile(KAKAO_TOKEN_PATH, JSON.stringify(newData, null, 2), "utf8");
    console.log("Kakao tokens saved to cache file.");
  } catch (error) {
    console.error("Failed to save Kakao tokens:", error);
  }
}

async function getSavedKakaoToken(): Promise<{ access_token?: string; refresh_token?: string } | null> {
  try {
    const fileContent = await fs.readFile(KAKAO_TOKEN_PATH, "utf8");
    return JSON.parse(fileContent);
  } catch {
    return null;
  }
}

export class KakaoNotificationService {
  private accessToken: string | null = process.env.KAKAO_ACCESS_TOKEN || null;

  constructor() {
    this._initializeToken();
  }

  private async _initializeToken() {
    const saved = await getSavedKakaoToken();
    if (saved?.access_token) {
      this.accessToken = saved.access_token;
    }
  }

  private async _refreshAccessToken(): Promise<boolean> {
    console.log("Attempting to refresh Kakao Access Token...");

    const savedTokens = await getSavedKakaoToken();
    const currentRefreshToken = savedTokens?.refresh_token || schedulerConfig.kakao.refreshToken;

    if (!currentRefreshToken || !schedulerConfig.kakao.clientId) {
      console.error("Refresh token or Client ID is not set.");
      return false;
    }

    const data = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: schedulerConfig.kakao.clientId,
      refresh_token: currentRefreshToken,
    }).toString();

    try {
      const response = await axios.post(schedulerConfig.kakao.authUrl, data, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });

      this.accessToken = response.data.access_token;

      const newTokens: { access_token: string; refresh_token?: string } = {
        access_token: response.data.access_token,
      };

      if (response.data.refresh_token) {
        console.warn("New Refresh Token issued. Saving to file.");
        newTokens.refresh_token = response.data.refresh_token;
      }

      await saveKakaoToken(newTokens);
      console.log("Successfully refreshed and saved Kakao Access Token.");

      return true;
    } catch (error) {
      console.error("Failed to refresh Kakao Access Token:", error);
      return false;
    }
  }

  private async _sendMessage(url: string, data: URLSearchParams, attempt = 1): Promise<void> {
    if (!this.accessToken) {
      console.warn("No Access Token found. Attempting to refresh token first.");
      const refreshed = await this._refreshAccessToken();
      if (!refreshed) {
        console.error("Cannot send message due to token refresh failure.");
        return;
      }
    }

    try {
      console.log(`Attempting to send Kakao message: ${url}`);
      await axios.post(url, data.toString(), {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      console.log(`Successfully sent Kakao message: ${url}`);
    } catch (error) {
      const axiosError = error as AxiosError<{ code?: number }>;
      if (axiosError.response?.data?.code === -401 && attempt === 1) {
        console.warn("Token expiration detected (-401). Retrying after refresh.");
        if (await this._refreshAccessToken()) {
          await this._sendMessage(url, data, 2);
        }
      } else {
        console.error("Final failure to send Kakao message:", axiosError.response?.data || axiosError.message);
      }
    }
  }

  public async notify(templateObject: object): Promise<void> {
    const toMeUrl = `${schedulerConfig.kakao.apiUrl}/v2/api/talk/memo/default/send`;
    const toMeData = new URLSearchParams({
      template_object: JSON.stringify(templateObject),
    });
    await this._sendMessage(toMeUrl, toMeData);

    if (schedulerConfig.kakao.friendUuids.length > 0) {
      const toFriendsUrl = `${schedulerConfig.kakao.apiUrl}/v1/api/talk/friends/message/default/send`;
      const toFriendsData = new URLSearchParams({
        receiver_uuids: JSON.stringify(schedulerConfig.kakao.friendUuids),
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

  public createLottoSetsTemplate = (drawNo: number) => (sets: LottoSet[]): object => ({
    object_type: "list",
    header_title: `${drawNo}회차 로또 번호`,
    header_link: {
      web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
      mobile_web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
    },
    contents: sets.map((set, index) => ({
      title: `${index + 1}번째 조합`,
      description: set.numbers.join(", "),
      image_url: `${schedulerConfig.apiBaseUrl}/lotto.png`,
      link: {
        web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
        mobile_web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
      },
    })),
    buttons: [
      {
        title: "전체 번호 확인하기",
        link: {
          web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
          mobile_web_url: `${schedulerConfig.apiBaseUrl}/lotto`,
        },
      },
    ],
  });

  public createStockStatusTemplate = (signals: StockSignalInfo[]): object => {
    return {
      object_type: "list",
      header_title: "KIS 미국 주식 신호",
      header_link: {
        web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
        mobile_web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
      },
      contents: signals.map((item) => {
        const { name, currentSignal, lastMeaningfulSignal } = item;
        const isHold = currentSignal.type === "hold";
        const targetSignal = isHold && lastMeaningfulSignal ? lastMeaningfulSignal : currentSignal;

        let statusText = "";
        if (targetSignal.type === "buy") statusText = "매수";
        else if (targetSignal.type === "inverse-buy") statusText = "인버스 매수";
        else if (targetSignal.type === "sell") statusText = "수익 실현";

        let isBuyHoldState = false;
        if (isHold && (targetSignal.type === "buy" || targetSignal.type === "inverse-buy")) {
          statusText += " 유지";
          isBuyHoldState = true;
        }

        const dateSuffix = isBuyHoldState ? " ~" : "";
        const title = `[${name}] ${targetSignal.date}${dateSuffix}`;
        const description = `${statusText} (${targetSignal.reason})`;

        return {
          title: title,
          description: description,
          image_url: `${schedulerConfig.apiBaseUrl}/lotto.png`,
          link: {
            web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
            mobile_web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
          },
        };
      }),
      buttons: [
        {
          title: "KIS 주식 페이지로 이동",
          link: {
            web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
            mobile_web_url: `${schedulerConfig.apiBaseUrl}/kis-stock`,
          },
        },
      ],
    };
  };
}
