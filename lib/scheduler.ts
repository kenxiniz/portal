/* lib/scheduler.ts */

import cron from 'node-cron';
import axios, { AxiosError } from 'axios';
import { LottoSet, LottoWeek } from '@/types/lotto';
import { getDrawNoForDate } from './lottoUtils';
import path from 'path';
import fs from 'fs/promises';

/* [삭제] 더 이상 사용하지 않는 변수를 제거합니다. */
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

  const createLottoSetsNotificationTemplate = (drawNo: number, sets: LottoSet[]): object => {
    return {
      "object_type": "list",
      "header_title": `🎟️ ${drawNo}회차 로또 번호`,
      "header_link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` },
      "contents": sets.map((set, index) => ({
        "title": `${index + 1}번째 조합`,
        "description": set.numbers.join(', '),
        "image_url": `${process.env.NEXTAUTH_URL}/lotto.jpg`,
        "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` }
      })),
      "buttons": [{ "title": "전체 번호 확인하기", "link": { "web_url": `${process.env.NEXTAUTH_URL}/lotto`, "mobile_web_url": `${process.env.NEXTAUTH_URL}/lotto` } }]
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
        const template = createLottoSetsNotificationTemplate(currentDrawNo, currentWeekData.generatedSets);
        await sendKakaoNotifications(template);
      } else {
        console.log(`[로또 알림] ${currentDrawNo}회차에 해당하는 생성된 번호가 없어 발송을 건너뜁니다.`);
      }
    } catch (error) {
      console.error('[로또 알림] 번호 발송 중 오류 발생:', error);
    }
  }, { timezone: "Asia/Seoul" });
}
