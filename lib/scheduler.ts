/* lib/scheduler.ts */

import cron from 'node-cron';
import axios, { AxiosError } from 'axios';
import { LottoSet, LottoWeek } from '@/types/lotto';
import { getDrawNoForDate } from './lottoUtils';
import path from 'path';
import fs from 'fs/promises';
import stockConfig from './stock.json'; // 주식 종목 정보를 가져오기 위해 import 추가
import { TradingSignal } from './stockUtils'; // TradingSignal 타입을 가져오기 위해 import 추가

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');

declare global {
  var isSchedulerRunning: boolean | undefined;
}

if (global.isSchedulerRunning) {
  console.log('스케줄러가 이미 실행 중입니다.');
} else {
  global.isSchedulerRunning = true;
  console.log('스케줄러를 시작합니다...');

  let currentAccessToken = process.env.KAKAO_ACCESS_TOKEN;
  const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
  const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
  const KAKAO_FRIEND_UUIDS_STRING = process.env.KAKAO_FRIEND_UUIDS;

  async function refreshAccessToken() {
    console.log('Access Token 갱신을 시도합니다...');
    if (!KAKAO_REFRESH_TOKEN || !KAKAO_CLIENT_ID) {
      console.error('리프레시 토큰 또는 클라이언트 ID가 설정되지 않았습니다.');
      return false;
    }
    const url = 'https://kauth.kakao.com/oauth/token';
    const data = new URLSearchParams();
    data.append('grant_type', 'refresh_token');
    data.append('client_id', KAKAO_CLIENT_ID);
    data.append('refresh_token', KAKAO_REFRESH_TOKEN);
    try {
      const response = await axios.post(url, data.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      });
      currentAccessToken = response.data.access_token;
      console.log('Access Token 갱신 성공!');
      if(response.data.refresh_token) {
        console.warn('새로운 Refresh Token이 발급되었습니다:', response.data.refresh_token);
      }
      return true;
    } catch (error) {
      console.error('Access Token 갱신 실패:', error);
      return false;
    }
  }

  /* [수정] 제네릭을 사용하여 'any' 타입 오류를 해결합니다. */
  async function sendKakaoNotificationsInChunks<T>(createTemplate: (chunk: T[]) => object, items: T[], chunkSize: number) {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const template = createTemplate(chunk);
      await sendKakaoMessageToMe(template);
      if (KAKAO_FRIEND_UUIDS_STRING) {
        await sendKakaoMessageToFriends(template);
      }
    }
  }

  async function sendKakaoMessageToMe(template_object: object, attempt = 1) {
    if (!currentAccessToken) {
      console.error('카카오톡 Access Token이 없습니다. (나에게 보내기)');
      return;
    }
    const url = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
    const headers = { 'Authorization': `Bearer ${currentAccessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const data = new URLSearchParams();
    data.append('template_object', JSON.stringify(template_object));
    try {
      console.log('카카오톡 나에게 메시지 발송 시도...');
      const response = await axios.post(url, data.toString(), { headers });
      console.log('카카오톡 나에게 메시지 전송 성공:', response.data);
    } catch (error) {
      const axiosError = error as AxiosError<{ code?: number; msg?: string }>;
      if (axiosError.response?.data?.code === -401 && attempt === 1) {
        if (await refreshAccessToken()) await sendKakaoMessageToMe(template_object, 2);
      } else {
        console.error('카카오톡 나에게 메시지 전송 최종 실패:', axiosError.response?.data || axiosError.message);
      }
    }
  }

  async function sendKakaoMessageToFriends(template_object: object, attempt = 1) {
    if (!currentAccessToken) {
      console.error('카카오톡 Access Token이 없습니다. (친구에게 보내기)');
      return;
    }
    const friendUuids = KAKAO_FRIEND_UUIDS_STRING!.split(',').map(s => s.trim());
    const receiverUuids = JSON.stringify(friendUuids);
    const url = 'https://kapi.kakao.com/v1/api/talk/friends/message/default/send';
    const headers = { 'Authorization': `Bearer ${currentAccessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const data = new URLSearchParams();
    data.append('receiver_uuids', receiverUuids);
    data.append('template_object', JSON.stringify(template_object));
    try {
      console.log('카카오톡 친구에게 메시지 발송 시도...');
      const response = await axios.post(url, data.toString(), { headers });
      console.log('카카오톡 친구에게 메시지 전송 성공:', response.data);
    } catch (error) {
      const axiosError = error as AxiosError<{ code?: number; msg?: string }>;
      if (axiosError.response?.data?.code === -401 && attempt === 1) {
        if (await refreshAccessToken()) await sendKakaoMessageToFriends(template_object, 2);
      } else {
        console.error('카카오톡 친구에게 메시지 전송 최종 실패:', axiosError.response?.data || axiosError.message);
      }
    }
  }

  const createLottoSetsNotificationTemplate = (drawNo: number) => (sets: LottoSet[]): object => {
    return {
      "object_type": "list",
      "header_title": `🎟️ ${drawNo}회차 로또 번호`,
      "header_link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` },
      "contents": sets.map((set, index) => ({
        "title": `${index + 1}번째 조합`,
        "description": set.numbers.join(', '),
        "image_url": `${process.env.NEXTAUTH_URL}/lotto.png`,
        "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` }
      })),
      "buttons": [{ "title": "전체 번호 확인하기", "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` } }]
    };
  };

  const createAllStockStatusNotificationTemplate = (signals: { name: string, signal: TradingSignal }[]): object => {
    return {
      "object_type": "list",
      "header_title": "🇺🇸 미국 주식 현재 상태",
      "header_link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` },
      "contents": signals.map(item => ({
        "title": `[${item.name}] ${item.signal.reason}`,
        "description": item.signal.details || `현재 상태: ${item.signal.type}`,
        "image_url": `${process.env.NEXTAUTH_URL}/lotto.png`, // TODO: 적절한 아이콘으로 변경
        "link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` }
      })),
      "buttons": [{ "title": "미국 주식 페이지로 이동", "link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` } }]
    };
  };

  cron.schedule('0 9 * * 0', async () => {
    console.log('매주 일요일 오전 9시: 로또 당첨 번호 업데이트를 시작합니다...');
    try {
      const response = await axios.get(`${process.env.NEXTAUTH_URL}/api/lotto/update-winning-numbers`);
      console.log('✅ 로또 당첨 번호 업데이트 성공:', response.data.message);
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('❌ 로또 당첨 번호 업데이트 실패:', axiosError.response?.data || axiosError.message);
    }
  }, { timezone: "Asia/Seoul" });

  cron.schedule('0 8 * * *', async () => {
    console.log(`[로또 알림] 매일 오전 8시: 이번 주 로또 번호 발송을 시작합니다...`);
    try {
      const lottoDb: Record<string, LottoWeek> = JSON.parse(await fs.readFile(lottoDbPath, 'utf8'));
      const currentDrawNo = getDrawNoForDate(new Date());
      const currentWeekData = Object.values(lottoDb).find(w => w.drawNo === currentDrawNo);

      if (currentWeekData && currentWeekData.generatedSets.length > 0) {
        console.log(`[로또 알림] ${currentDrawNo}회차 생성된 번호 ${currentWeekData.generatedSets.length}세트를 발송합니다.`);
        const templateFn = createLottoSetsNotificationTemplate(currentDrawNo);
        await sendKakaoNotificationsInChunks(templateFn, currentWeekData.generatedSets, 3);
      } else {
        console.log(`[로또 알림] ${currentDrawNo}회차에 해당하는 생성된 번호가 없어 발송을 건너뜁니다.`);
      }
    } catch (error) {
      console.error('[로또 알림] 번호 발송 중 오류 발생:', error);
    }
  }, { timezone: "Asia/Seoul" });

  cron.schedule('0 9 * * *', async () => {
    console.log('[매매 신호 알림] 매일 오전 9시: 미국 주식 전체 상태 확인을 시작합니다...');
    const usStocks = stockConfig.us_stocks;
    const allLatestSignals: { name: string, signal: TradingSignal }[] = [];

    for (const stock of usStocks) {
      try {
        const response = await axios.get(`${process.env.NEXTAUTH_URL}/api/stock/${stock.ticker}`);
        const { signals }: { signals: TradingSignal[] } = response.data;

        if (signals && signals.length > 0) {
          const latestSignal = signals[signals.length - 1];
          allLatestSignals.push({ name: stock.ticker, signal: latestSignal });
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(`[매매 신호 알림] ${stock.ticker} 상태 확인 중 오류 발생:`, axiosError.response?.data || axiosError.message);
      }
    }

    if (allLatestSignals.length > 0) {
      console.log(`[매매 신호 알림] ${allLatestSignals.length}개의 미국 주식 종목 상태를 확인하여 알림을 발송합니다.`);
      await sendKakaoNotificationsInChunks(createAllStockStatusNotificationTemplate, allLatestSignals, 3);
    } else {
      console.log('[매매 신호 알림] 조회할 미국 주식 종목이 없거나 데이터를 가져오는 데 실패했습니다.');
    }
  }, { timezone: "Asia/Seoul" });
}
