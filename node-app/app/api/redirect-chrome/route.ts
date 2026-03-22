/* app/api/redirect-chrome/route.ts (Next.js App Router 기준) */
/* 만약 Pages Router를 쓰신다면 pages/api/redirect-chrome.ts 에 맞게 수정하세요 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("target") || "kis-stock";

  // Base URL for the target dashboard
  const domain = "kenxin.org";
  const targetUrl = `${domain}/${targetPath}`;

  // Create Android Chrome Intent URL
  const chromeIntentUrl = `intent://${targetUrl}#Intent;scheme=https;package=com.android.chrome;end;`;
  const fallbackUrl = `https://${targetUrl}`;

  // HTML content that automatically triggers the redirect
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Redirecting to Chrome...</title>
      <script>
        // Attempt to open Chrome directly via Intent
        window.location.href = "${chromeIntentUrl}";
        
        // Fallback to standard HTTPS if Intent fails (e.g., on iOS or Desktop)
        setTimeout(function() {
            window.location.href = "${fallbackUrl}";
        }, 1500);
      </script>
      <style>
        body { font-family: sans-serif; text-align: center; padding-top: 50px; }
      </style>
    </head>
    <body>
      <p>크롬 브라우저로 이동 중입니다...</p>
      <p>화면이 넘어가지 않으면 <a href="${fallbackUrl}">여기</a>를 클릭하세요.</p>
    </body>
    </html>
  `;

  return new NextResponse(htmlContent, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
