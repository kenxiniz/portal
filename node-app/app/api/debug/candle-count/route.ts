import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import fs from "fs";

const SCREENSHOT_DIR = "/app/screenshots";
const timeframes = ["1d", "1h", "15m"];
const tfMap: Record<string, string> = {
  "1d": "일봉",
  "1h": "1시간",
  "15m": "15분",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tf = searchParams.get("tf");

  // 특정 timeframe 이미지 요청 시
  if (tf) {
    const imgPath = `${SCREENSHOT_DIR}/chart_${tf}.png`;
    if (fs.existsSync(imgPath)) {
      const buffer = fs.readFileSync(imgPath);
      const stat = fs.statSync(imgPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-cache",
          "X-Last-Modified": stat.mtime.toISOString(),
        },
      });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 스크린샷 촬영
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

    // 인증 설정
    await page.authenticate({
      username: "gg",
      password: "gg",
    });

    // 화면 크기 설정
    await page.setViewport({ width: 1920, height: 1080 });

    // 페이지 로드
    await page.goto("https://kenxin.org/binance", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // API 키 입력 및 로그인
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

    // 차트 로딩 대기
    await new Promise((r) => setTimeout(r, 3000));

    // 랜덤 순회 (5~8회)
    const iterations = 5 + Math.floor(Math.random() * 4);
    const logs: string[] = [`Iterations: ${iterations}`];

    for (let i = 0; i < iterations; i++) {
      const tfKey = timeframes[Math.floor(Math.random() * timeframes.length)];
      const tfText = tfMap[tfKey];
      logs.push(`[${i + 1}/${iterations}] Switching to ${tfKey}`);

      // timeframe 버튼 클릭
      const buttons = await page.$$("button");
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.textContent, btn);
        if (text && text.includes(tfText)) {
          await btn.click();
          break;
        }
      }

      // 차트 로딩 대기
      await new Promise((r) => setTimeout(r, 2000));

      // 스크린샷 저장
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }
      const screenshotPath = `${SCREENSHOT_DIR}/chart_${tfKey}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      logs.push(`Screenshot saved: ${screenshotPath}`);
    }

    await browser.close();

    return NextResponse.json({
      success: true,
      logs: logs.join("\n"),
      files: timeframes.map((t) => `/api/debug/candle-count?tf=${t}`),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
