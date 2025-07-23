/* middleware.ts */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/* 보호할 페이지 경로 목록 */
const protectedRoutes = ['/my-properties', '/stock', '/kis-stock', '/k-stock']

/* ❗ Edge Runtime (middleware)는 process.env 직접 사용 불가 → 상수로 미리 읽어서 빌드 시 포함 */
const COOKIE_NAME = 'app-auth-token'

/* [수정] 실행 환경에 따라 리디렉션할 기본 URL을 동적으로 결정합니다. */
const getBaseUrl = () => {
  if (process.env.APP_ENV === 'docker') {
    return 'https://kenxin.org'; // 도커 환경일 경우
  }
  return 'https://dev.kenxin.org'; // 그 외 (로컬 빌드 등)
}

export function middleware(request: NextRequest) {
  const baseUrl = getBaseUrl();

  // 보호된 경로에만 동작
  if (protectedRoutes.some((path) => request.nextUrl.pathname.startsWith(path))) {
    const authToken = request.cookies.get(COOKIE_NAME)

    // 쿠키가 없거나 값이 'true' 가 아닌 경우 → 로그인 페이지로 리다이렉트
    if (!authToken || authToken.value !== 'true') {
      const loginUrl = new URL('/login', baseUrl)

      // callbackUrl: 사용자가 가려던 페이지 (쿼리 스트링 포함 가능)
      loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)

      return NextResponse.redirect(loginUrl)
    }
  }

  // 보호 경로 외: 계속 진행
  return NextResponse.next()
}
