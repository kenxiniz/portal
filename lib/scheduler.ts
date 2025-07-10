/* lib/scheduler.ts */

import cron from 'node-cron';
import axios, { AxiosError } from 'axios';
import allTickers from '@/lib/stock.json';
import { TradingSignal } from './stockUtils';

declare global {
  var isSchedulerRunning: boolean | undefined;
}

/* 스케줄러 중복 실행 방지 */
if (global.isSchedulerRunning) {
  console.log('스케줄러가 이미 실행 중입니다.');
} else {
  global.isSchedulerRunning = true;
  console.log('스케줄러를 시작합니다...');

  /* --- 토큰 및 상태 관리 --- */
  let currentAccessToken = process.env.KAKAO_ACCESS_TOKEN;
  const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;
  const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;

  const lastSentSignals: { [ticker: string]: string } = {};
  let noSignalMessageSent = false;

  /* Access Token 갱신 함수 */
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

  /* 카카오톡 메시지 전송 공통 함수 */
  async function sendKakaoMessage(template_object: object, attempt = 1) {
    if (!currentAccessToken) {
      console.error('카카오톡 Access Token이 없습니다.');
      return;
    }
    const url = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
    const headers = {
      'Authorization': `Bearer ${currentAccessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const data = new URLSearchParams();
    data.append('template_object', JSON.stringify(template_object));
    try {
      console.log('카카오톡 메시지 발송 시도:', template_object);
      await axios.post(url, data.toString(), { headers });
      console.log('카카오톡 메시지 전송 성공');
    } catch (error) {
      /* [핵심 수정] 에러 처리 로직을 강화하여 모든 종류의 에러를 상세히 로그로 남깁니다. */
      const axiosError = error as AxiosError<{ code?: number; msg?: string }>;

      /* [디버깅 로그] 어떤 에러 응답이 왔는지 확인합니다. */
      if (axiosError.response) {
        console.error('[DEBUG] 카카오 API 에러 응답 데이터:', axiosError.response.data);
      }

      if (axiosError.response && axiosError.response.data && axiosError.response.data.code === -401 && attempt === 1) {
        console.warn('메시지 전송 실패, 토큰 만료 의심. 갱신 후 재시도합니다.');
        const refreshed = await refreshAccessToken();
        if (refreshed) await sendKakaoMessage(template_object, 2);
      } else {
        /* [핵심 수정] 에러의 원인을 명확하게 출력합니다. */
        const errorMessage = axiosError.response ? JSON.stringify(axiosError.response.data) : axiosError.message;
        console.error('카카오톡 메시지 전송 최종 실패:', errorMessage);
      }
    }
  }

  /* '신호 없음' 알림 전송 함수 */
  async function sendNoSignalNotification() {
    const template = {
      object_type: 'text',
      text: `모니터링 중인 모든 종목(${allTickers.tickers.join(', ')})에 새로운 매매 신호가 없습니다.`,
      link: {
        web_url: `${process.env.NEXTAUTH_URL}/stock`,
        mobile_web_url: `${process.env.NEXTAUTH_URL}/stock`,
      },
      button_title: '포트폴리오 확인하기'
    };
    await sendKakaoMessage(template);
  }

  /* 주식 데이터 캐시 업데이트 (매일 오전 7시) */
  cron.schedule('0 7 * * *', async () => {
    console.log('매일 오전 7시: 주식 데이터 캐시 업데이트를 시작합니다...');
    for (const ticker of allTickers.tickers) {
      try {
        await axios.get(`${process.env.NEXTAUTH_URL}/api/stock/${ticker}`);
        console.log(`[${ticker}] 캐시 업데이트 완료`);
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(`[${ticker}] 캐시 업데이트 실패:`, axiosError.message);
      }
    }
  }, { timezone: "Asia/Seoul" });

  /* 매매
   * 신호
   * 감지
   * 및
   * 알림
   * (매
   * 1분)
   * */
  cron.schedule('* * * * *', async () => {
    console.log('--------------------');
    console.log(`[${new Date().toLocaleTimeString()}] 매매 신호를 확인합니다...`);
    let anyNewSignalFound = false;

    for (const ticker of allTickers.tickers) {
      try {
        console.log(`[${ticker}] 신호 확인 중...`);
        const response = await axios.get(`${process.env.NEXTAUTH_URL}/api/stock/${ticker}`);
        const { signals }: { signals: TradingSignal[] } = response.data;
        const latestSignal = signals.at(-1);

        console.log(`[${ticker}] 최신 신호:`, latestSignal ?? '없음');

        if (latestSignal && latestSignal.type !== 'hold') {
          const signalId = `${ticker}-${latestSignal.type}-${latestSignal.date}`;

          console.log(`[${ticker}] 신호 비교: (이전: ${lastSentSignals[ticker] || '없음'}) vs (현재: ${signalId})`);
          if (lastSentSignals[ticker] !== signalId) {
            const signalType = latestSignal.type.includes('buy') ? '📈 매수' : '📉 매도';
            const price = latestSignal.entryPrice ?? latestSignal.realizedPrice;
            const profitRate = latestSignal.profitRate;

            const template = {
              object_type: 'text',
              text: `[${ticker}] ${signalType} 신호\n\n- 전략: ${latestSignal.reason}\n- 날짜: ${latestSignal.date}\n- 가격: ${price ? `$${price.toFixed(2)}` : '-'}\n- 수익률: ${profitRate ? `${profitRate.toFixed(2)}%` : '-'}`,
              link: { web_url: `${process.env.NEXTAUTH_URL}/stock`, mobile_web_url: `${process.env.NEXTAUTH_URL}/stock` },
              button_title: '포트폴리오 바로가기'
            };

            await sendKakaoMessage(template);
            lastSentSignals[ticker] = signalId;
            anyNewSignalFound = true;
          }
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        console.error(`[${ticker}] 신호 확인 중 에러 발생:`, axiosError.message);
      }
    }

    console.log(`순회 완료. 새로운 신호 발견 여부: ${anyNewSignalFound}, '신호 없음' 메시지 발송 여부: ${noSignalMessageSent}`);

    if (anyNewSignalFound) {
      noSignalMessageSent = false;
    } else {
      if (!noSignalMessageSent) {
        console.log("새로운 매매 신호가 없어 '신호 없음' 메시지를 전송합니다.");
        await sendNoSignalNotification();
        noSignalMessageSent = true;
      } else {
        console.log("'신호 없음' 상태이나, 중복 발송을 방지하기 위해 이번에는 메시지를 보내지 않습니다.");
      }
    }
    console.log('--------------------');
  });
}
