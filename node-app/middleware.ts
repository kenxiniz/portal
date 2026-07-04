/* middleware.ts */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = [
  "/my-properties",
  "/stock",
  "/kis-stock",
  "/k-stock",
  "/binance",
  "/api/friends",
  "/lotto",
];

const COOKIE_NAME = "app-auth-token";

export function middleware(request: NextRequest) {
  if (
    protectedRoutes.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    const authToken = request.cookies.get(COOKIE_NAME);

    if (!authToken || authToken.value !== "true") {
      // Create a dynamic login URL based on the current request's origin
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";

      // Clear any existing search parameters before setting the callback
      loginUrl.search = "";
      loginUrl.searchParams.set(
        "callbackUrl",
        request.nextUrl.pathname + request.nextUrl.search,
      );

      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}
