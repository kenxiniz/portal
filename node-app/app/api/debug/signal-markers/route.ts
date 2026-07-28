import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import fs from "fs";

const SCREENSHOT_DIR = "/app/screenshots";

export async function GET() {
  try {
    const execPath =
      process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--disable-crash-reporter",
        "--disable-breakpad",
        "--disable-extensions",
        "--no-zygote",
        "--crashpad-database=/tmp/crashpad",
      ],
    });

    const page = await browser.newPage();

    // 콘솔 로그 캡처
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.authenticate({
      username: "gg",
      password: "gg",
    });

    await page.setViewport({ width: 1920, height: 1080 });

    // 1h 타임프레임으로 직접 시작
    await page.goto("https://kenxin.org/binance?tf=1h", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Login
    await page
      .waitForSelector('input[type="text"], input[placeholder*="API"]', {
        timeout: 5000,
      })
      .catch(() => {});
    const input = await page.$('input[type="text"], input[placeholder*="API"]');
    if (input) {
      await input.type("gg");
      await page.click('button[type="submit"], button');
      await page
        .waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 })
        .catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 3000));

    const logs: string[] = [];
    const files: string[] = [];

    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // 1. 이미 1h로 시작 (URL param: ?tf=1h), 데이터 로드 대기
    logs.push("Started with 1h timeframe via URL param");
    // 차트 렌더링 완료 대기 (캔들 요소 확인)
    await page
      .waitForSelector(".tv-lightweight-charts canvas", { timeout: 15000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 15000));

    // 줌 없이 기본 100개 봉 표시
    logs.push("Using default 100 bar count, no zoom");

    // 3. SOXL 1h 스크린샷
    const file1h = "signal_soxl_1h.png";
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/${file1h}`,
      fullPage: false,
    });
    files.push(file1h);
    logs.push(`Captured: ${file1h}`);

    // 15분봉 테스트 생략 - 1h만 확인

    await browser.close();

    return NextResponse.json({
      success: true,
      logs: logs.join("\n"),
      consoleLogs: consoleLogs.slice(-100),
      files: files.map((f) => `/api/debug/signal-markers/img?f=${f}`),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
