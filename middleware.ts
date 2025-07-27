/* middleware.ts */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/* [수정] 보호할 페이지 경로 목록에 '/api/friends'를 추가합니다. */
const protectedRoutes = ['/my-properties', '/stock', '/kis-stock', '/k-stock', '/api/friends', '/lotto']

const COOKIE_NAME = 'app-auth-token'

const getBaseUrl = () => {
  if (process.env.APP_ENV === 'docker') {
    return 'https://kenxin.org';
  }
  return 'https://dev.kenxin.org';
}

export function middleware(request: NextRequest) {
  const baseUrl = getBaseUrl();

  if (protectedRoutes.some((path) => request.nextUrl.pathname.startsWith(path))) {
    const authToken = request.cookies.get(COOKIE_NAME)

    if (!authToken || authToken.value !== 'true') {
      const loginUrl = new URL('/login', baseUrl)
      loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}
