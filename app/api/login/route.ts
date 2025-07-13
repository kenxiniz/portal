/* app/api/login/route.ts */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키를 입력해주세요.' }, { status: 400 });
    }

    if (apiKey === process.env.ACCESS_API_KEY) {
      const expires = new Date(Date.now() + 864e5); // 24시간 후 만료
      const response = NextResponse.json({ success: true });

      response.cookies.set({
        name: 'app-auth-token',
        value: 'true',
        expires: expires,
        path: '/',
        httpOnly: true, // JavaScript에서 접근 불가
        secure: process.env.NODE_ENV === 'production', // 프로덕션 환경에서만 secure 설정
      });

      return response;
    } else {
      return NextResponse.json({ error: 'API 키가 올바르지 않습니다.' }, { status: 401 });
    }
  } catch (error) {
    console.error('Login API Error:', error);
    return NextResponse.json({ error: '로그인 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
