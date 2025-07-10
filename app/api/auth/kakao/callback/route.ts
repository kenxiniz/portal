/* app/api/auth/kakao/callback/route.ts */

import { NextRequest, NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios'; /* AxiosError 타입을 import 합니다. */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: '인가 코드가 없습니다.' }, { status: 400 });
  }

  const KAKAO_CLIENT_ID = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
  const REDIRECT_URI = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;

  const tokenUrl = 'https://kauth.kakao.com/oauth/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', KAKAO_CLIENT_ID!);
  params.append('redirect_uri', REDIRECT_URI!);
  params.append('code', code);

  try {
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    const { access_token, refresh_token } = response.data;

    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
    <meta charset="UTF-8">
    <title>카카오 토큰 발급</title>
    <style>
    body { font-family: sans-serif; padding: 2em; }
    textarea { padding: 0.5em; margin-top: 0.5em; }
    </style>
    </head>
    <body>
    <h1>카카오 토큰 발급 성공</h1>
    <p>아래 access_token 값을 복사하여 .env.local 파일의 KAKAO_ACCESS_TOKEN 값으로 설정하세요.</p>
    <textarea rows="5" style="width: 100%;" readonly>${access_token}</textarea>
    <hr style="margin: 2em 0;" />
    <p>아래는 Refresh Token 입니다 (액세스 토큰 만료 시 재발급용).</p>
    <textarea rows="5" style="width: 100%;" readonly>${refresh_token || '리프레시 토큰이 발급되지 않았습니다. 카카오 로그인 보안 설정을 확인하세요.'}</textarea>
    </body>
    </html>
    `;

    return new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) { /* [수정] error의 타입을 명시합니다. */
  const axiosError = error as AxiosError;
  const errorMessage = axiosError.response ? JSON.stringify(axiosError.response.data) : axiosError.message;
  console.error("토큰 발급 실패:", errorMessage);
  return NextResponse.json({ error: '토큰 발급에 실패했습니다.' }, { status: 500 });
  }
}
