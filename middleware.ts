/* middleware.ts */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/* 보호할 페이지 경로 목록 */
const protectedRoutes = ['/my-properties', '/stock', '/kis-stock', '/k-stock']

// ❗ Edge Runtime (middleware)는 process.env 직접 사용 불가 → 상수로 미리 읽어서 빌드 시 포함
const COOKIE_NAME = 'app-auth-token'
const NEXTAUTH_URL = process.env.NEXTAUTH_URL

if (!NEXTAUTH_URL) {
  console.error('Middleware Error: NEXTAUTH_URL is not set.')
  // Edge Runtime 에서는 throw 도 가능
  throw new Error('NEXTAUTH_URL environment variable is not set.')
}

export function middleware(request: NextRequest) {
  // 보호된 경로에만 동작
  if (protectedRoutes.some((path) => request.nextUrl.pathname.startsWith(path))) {
    const authToken = request.cookies.get(COOKIE_NAME)

    // 쿠키가 없거나 값이 'true' 가 아닌 경우 → 로그인 페이지로 리다이렉트
    if (!authToken || authToken.value !== 'true') {
      const loginUrl = new URL('/login', NEXTAUTH_URL)

      // callbackUrl: 사용자가 가려던 페이지 (쿼리 스트링 포함 가능)
      loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)

      return NextResponse.redirect(loginUrl)
    }
  }

  // 보호 경로 외: 계속 진행
  return NextResponse.next()
}
