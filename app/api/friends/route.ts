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
    /* [수정] error의 타입을 AxiosError로 명확하게 지정합니다. */
    const axiosError = error as AxiosError<{ msg?: string, code?: number }>;
    console.error("친구 목록 조회 실패:", axiosError.response?.data || axiosError.message);
    return NextResponse.json(
      { error: '친구 목록 조회에 실패했습니다.', details: axiosError.response?.data },
      { status: 500 }
    );
  }
}
