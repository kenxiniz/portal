/* middleware.ts */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/* 보호할 페이지 경로 목록 */
const protectedRoutes = ['/my-properties', '/stock', '/kis-stock', '/k-stock']; /* [수정] /k-stock 추가 */

export function middleware(request: NextRequest) {
  /* 보호된 페이지에 접근하는 경우에만 쿠키를 확인합니다. */
  if (protectedRoutes.some(path => request.nextUrl.pathname.startsWith(path))) {
    const cookieName = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME!;
    const authToken = request.cookies.get(cookieName);

    /* 쿠키가 없거나, 값이 'true'가 아니면 로그인 페이지로 보냅니다. */
    if (!authToken || authToken.value !== 'true') {
      const baseUrl = process.env.NEXTAUTH_URL;

      if (!baseUrl) {
        console.error("Middleware Error: NEXTAUTH_URL environment variable is not set.");
        return new Response("Configuration error: NEXTAUTH_URL is not set.", { status: 500 });
      }

      const loginUrl = new URL('/login', baseUrl);
      const targetUrl = new URL(request.nextUrl.pathname, baseUrl);
      loginUrl.searchParams.set('callbackUrl', targetUrl.href);

      return NextResponse.redirect(loginUrl);
    }
  }

  /* 그 외의 경우는 정상적으로 페이지를 보여줍니다. */
  return NextResponse.next();
}
