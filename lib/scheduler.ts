/* lib/scheduler.ts */

import cron from 'node-cron';
import axios, { AxiosError } from 'axios';
import stockConfig from './stock.json';
import { TradingSignal } from './stockUtils';
import { LottoSet } from '@/types/lotto';

const tickers = stockConfig.us_stocks.map(t => t.ticker);

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

  async function sendKakaoNotifications(template_object: object) {
    await sendKakaoMessageToMe(template_object);
    if (KAKAO_FRIEND_UUIDS_STRING) {
      await sendKakaoMessageToFriends(template_object);
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

  /* 생성된 번호를 보여주는 알림 템플릿 */
  const createLottoSetsNotificationTemplate = (sets: LottoSet[]): object => {
    return {
      "object_type": "list",
      "header_title": `🎟️ 이번 주 로또 번호 생성!`,
      "header_link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` },
      "contents": sets.map((set, index) => ({
        "title": `${index + 1}번째 조합`,
        "description": set.numbers.join(', '),
        "image_url": "https://mud-kage.kakao.com/dn/bA4hH/btsA5Z03f6D/N5mIIHR9Ypqkj9eO24tVF0/kakaolink40_original.png",
        "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` }
      })),
      "buttons": [{ "title": "전체 번호 확인하기", "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` } }]
    };
  };

  /* 최신
   * 신호
   * 정보를
   * 받아
   * 데일리
   * 요약
   * 템플릿을
   * 생성하는
   * 함수
   * */
  const createDailySummaryListTemplates = (latestSignals: {ticker: string, signal: TradingSignal | null}[]) => {
    const contents = latestSignals.map(({ticker, signal}) => {
        let description = "최근 매매 신호 없음";
        if (signal) {
        const date = new Date(signal.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        let priceInfo = '';
        if (signal.entryPrice) priceInfo = `$${signal.entryPrice.toFixed(2)}`;
        if (signal.realizedPrice) priceInfo = `$${signal.realizedPrice.toFixed(2)}`;
        if (signal.profitRate !== undefined) priceInfo += ` (${signal.profitRate >= 0 ? '+' : ''}${signal.profitRate.toFixed(1)}%)`;
        description = `${date} | ${signal.reason} | ${priceInfo}`;
        }
        return { 
        "title": ticker, 
        "description": description, 
        "image_url": "https://mud-kage.kakao.com/dn/b2p3o/btsA5Z2K23k/kTz8L6G3c2uV9s3EwWk7kK/kakaolink40_original.png", 
        "link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` } 
        };
        });

    const chunks = [];
    for (let i = 0; i < contents.length; i += 3) chunks.push(contents.slice(i, i + 3));

  return chunks.map((chunk, index) => ({
    "object_type": "list", 
    "header_title": `🇺🇸 미국 주식 데일리 요약 (${index + 1}/${chunks.length})`, 
    "header_link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` },
    "contents": chunk, 
    "buttons": [{ "title": "웹에서 전체보기", "link": { "web_url": `${process.env.NEXTAUTH_URL}/stock`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/stock` } }]
  }));
};

cron.schedule('0 9 * * 1', async () => {
  console.log(`매주 월요일 오전 9시: 로또 번호 생성을 시작합니다...`);
  try {
    const response = await axios.post(`${process.env.NEXTAUTH_URL}/api/lotto/generate-daily`);
    const { week, setsToSend } = response.data;

    if (setsToSend && setsToSend.length > 0) {
      console.log('✅ 새로 생성되어 발송할 로또 번호:', setsToSend.map((s: LottoSet) => s.numbers));
      const template = createLottoSetsNotificationTemplate(setsToSend);
      await sendKakaoNotifications(template);

      const usedSetsNumbers = setsToSend.map((s: LottoSet) => s.numbers);
      await axios.post(`${process.env.NEXTAUTH_URL}/api/lotto/mark-as-used`, { week: week, usedSets: usedSetsNumbers });
      console.log(`✅ ${week} 주차의 ${usedSetsNumbers.length}개 세트 발송 및 사용 처리 완료.`);
    } else {
      console.log('ℹ️ 이미 이번 주 번호가 생성 및 발송되어 작업을 건너뜁니다.');
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('❌ 로또 번호 생성 또는 알림 실패:', axiosError.response?.data || axiosError.message);
  }
}, { timezone: "Asia/Seoul" });

cron.schedule('0 7 * * *', async () => {
  console.log('매일 오전 7시: 주식 데이터 캐시 업데이트를 시작합니다...');
  for (const ticker of tickers) {
    try {
      console.log(`[${ticker}] 한투(KIS) API 캐시 업데이트 중...`);
      await axios.get(`${process.env.NEXTAUTH_URL}/api/kisStock/${ticker}`);
      console.log(`[${ticker}] 한투(KIS) 캐시 업데이트 완료`);
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(`[${ticker}] 한투(KIS) 캐시 업데이트 실패:`, axiosError.message);
    }
    try {
      console.log(`[${ticker}] 기존(Alpha Vantage) API 캐시 업데이트 중...`);
      await axios.get(`${process.env.NEXTAUTH_URL}/api/stock/${ticker}`);
      console.log(`[${ticker}] 기존(Alpha Vantage) 캐시 업데이트 완료`);
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(`[${ticker}] 기존(Alpha Vantage) 캐시 업데이트 실패:`, axiosError.message);
    }
  }
}, { timezone: "Asia/Seoul" });

cron.schedule('5 21 * * 6', async () => {
  console.log('매주 토요일 21:05: 로또 당첨 번호 업데이트를 시작합니다...');
  try {
    const response = await axios.get(`${process.env.NEXTAUTH_URL}/api/lotto/update-result`);
    console.log('✅ 로또 당첨 번호 업데이트 성공:', response.data.message);
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('❌ 로또 당첨 번호 업데이트 실패:', axiosError.response?.data || axiosError.message);
  }
}, { timezone: "Asia/Seoul" });

/* 매일
 * 오전
 * 8시에
 * 미국
 * 주식
 * 최신
 * 신호를
 * 요약하여
 * 보내는
 * 스케줄
 * */
cron.schedule('0 8 * * *', async () => {
    console.log('--------------------');
    console.log(`[${new Date().toLocaleTimeString('ko-KR')}] 데일리 주식 신호 요약을 시작합니다...`);

    const latestSignals: {ticker: string, signal: TradingSignal | null}[] = [];

for (const ticker of tickers) {
  try {
    /* 미국
     * 주식
     * 정보는
     * /api/stock/
     * API를
     * 호출해야
     * 합니다.
     * */
  const response = await axios.get(`${process.env.NEXTAUTH_URL}/api/stock/${ticker}`);
  const { signals }: { signals: TradingSignal[] } = response.data;

  /* 'hold'가
   * 아닌
   * 가장
   * 마지막
   * 신호를
   * 찾습니다.
   * */
  const lastSignal = signals.filter(s => s.type !== 'hold').pop() || null;
  latestSignals.push({ ticker, signal: lastSignal });

  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(`[${ticker}] 신호 확인 중 에러 발생:`, axiosError.message);
    latestSignals.push({ ticker, signal: null }); /* 에러 발생 시 데이터 없음으로 처리 */
  }
}

if (latestSignals.length > 0) {
  const templates = createDailySummaryListTemplates(latestSignals);
  for (const template of templates) {
    console.log("전송할 카카오톡 템플릿:", JSON.stringify(template, null, 2));
    await sendKakaoNotifications(template);
    /* 메시지
     * 순차
     * 발송을
     * 위한
     * 딜레이
     * (카카오
     * API
     * 정책)
     * */
    await new Promise(resolve => setTimeout(resolve, 300));
  }
} else {
  console.log("요약할 주식 정보가 없습니다.");
}
console.log('--------------------');
}, { timezone: "Asia/Seoul" });
}
