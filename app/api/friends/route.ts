/* app/api/friends/route.ts */

import { NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios';

export async function GET() {
  const KAKAO_ACCESS_TOKEN = process.env.KAKAO_ACCESS_TOKEN;

  if (!KAKAO_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: '카카오 Access Token이 설정되지 않았습니다. .env 파일을 확인하세요.' },
      { status: 400 }
    );
  }

  const url = 'https://kapi.kakao.com/v1/api/talk/friends';
  const headers = {
    'Authorization': `Bearer ${KAKAO_ACCESS_TOKEN}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const friends = response.data.elements;

    /* [수정] 친구 목록이 비어있을 경우 안내 페이지를 보여줍니다. */
    if (!friends || friends.length === 0) {
      const emptyHtmlResponse = `
      <div style="font-family: sans-serif; padding: 2em; text-align: center;">
      <h1 style="color: #ff4757;">친구 목록이 비어있습니다.</h1>
      <p style="color: #596275; line-height: 1.6;">
      카카오 정책에 따라, 내 친구 중 <strong>이 앱에 로그인하고 '친구 목록' 정보 제공에 동의한 친구</strong>만 목록에 표시됩니다.
        </p>
      <div style="background-color: #f1f2f6; padding: 1.5em; border-radius: 8px; margin-top: 2em; text-align: left;">
      <h2 style="margin-top: 0; color: #1e272e;">✅ 해결 방법</h2>
      <ol style="padding-left: 1.5em;">
      <li style="margin-bottom: 0.5em;">메시지를 받을 친구에게 이 사이트 주소를 알려주세요.</li>
      <li style="margin-bottom: 0.5em;">친구가 사이트 하단의 <strong>'토큰 발급'</strong> 링크를 통해 카카오 로그인을 진행해야 합니다.</li>
      <li style="margin-bottom: 0.5em;"><strong>(중요!)</strong> 로그인 과정에서 <strong>'[선택] 친구 목록'</strong> 항목을 반드시 체크하고 동의해야 합니다.</li>
      <li>친구가 로그인을 완료한 후, 다시 이 페이지를 새로고침하면 친구가 목록에 나타납니다.</li>
      </ol>
      </div>
      </div>
      `;
      return new NextResponse(emptyHtmlResponse, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    console.log("--- 친구 목록 (UUID) ---", friends);

    const htmlResponse = `
    <h1>친구 목록 조회 성공</h1>
    <p>메시지를 보낼 친구의 id 값을 복사하여 .env 파일의 KAKAO_FRIEND_UUIDS 변수에 추가하세요. 여러 명일 경우 쉼표(,)로 구분합니다.</p>
    <pre style="background-color: #f0f0f0; padding: 1em; border-radius: 5px;">${JSON.stringify(friends, null, 2)}</pre>
    `;

    return new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    const axiosError = error as AxiosError<{ msg?: string, code?: number }>;
    console.error("친구 목록 조회 실패:", axiosError.response?.data || axiosError.message);
    return NextResponse.json(
      { error: '친구 목록 조회에 실패했습니다.', details: axiosError.response?.data },
      { status: 500 }
    );
  }
}
