import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import fs from "fs";

const SCREENSHOT_DIR = "/app/screenshots";
const symbols = ["SOXL", "Tesla", "SPCX", "KOHU"]; // Page loads with SOXL

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

    await page.authenticate({
      username: "gg",
      password: "gg",
    });

    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto("https://kenxin.org/binance", {
      waitUntil: "networkidle2",
      timeout: 30000,
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

    // 1d (일봉) - 신호 마커 테스트용
    // 기본 일봉 상태로 테스트 (timeframe 변경 없음)

    const logs: string[] = [];
    logs.push("Testing on 1d timeframe (default)");
    const files: string[] = [];

    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    for (let i = 0; i < symbols.length; i++) {
      const currentSymbol = symbols[i];
      logs.push(`[${i + 1}/${symbols.length}] Processing: ${currentSymbol}`);

      // 1. Screenshot before drag
      const beforeFile = `yscale_${currentSymbol}_before.png`;
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${beforeFile}`,
        fullPage: false,
      });
      files.push(beforeFile);
      logs.push(`  - Before drag: ${beforeFile}`);

      // 2. Y축 스케일 변경 - 첫 번째 종목만 테스트
      if (i === 0) {
        const scaleResult = await page.evaluate(() => {
          const event = new CustomEvent("debug-yscale", {
            detail: { factor: 0.5 },
          });
          window.dispatchEvent(event);
          return { success: true, factor: 0.5 };
        });
        await new Promise((r) => setTimeout(r, 1500));
        logs.push(`  - Y-axis scale event: ${JSON.stringify(scaleResult)}`);
      } else {
        logs.push(`  - Skipping Y-axis scale (testing symbol change only)`);
      }

      // 3. Screenshot after scale change
      const afterDragFile = `yscale_${currentSymbol}_after_drag.png`;
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${afterDragFile}`,
        fullPage: false,
      });
      files.push(afterDragFile);
      logs.push(`  - After scale: ${afterDragFile}`);

      // 4. Change to next symbol (if not last)
      if (i < symbols.length - 1) {
        const nextSymbol = symbols[i + 1];
        const buttons = await page.$$("button");
        for (const btn of buttons) {
          const text = await page.evaluate((el) => el.textContent, btn);
          if (text && text.includes(nextSymbol)) {
            await btn.click();
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 5000)); // 데이터 로드 대기
        logs.push(`  - Changed: ${currentSymbol} -> ${nextSymbol}`);

        // 5. Screenshot after symbol change
        const afterChangeFile = `yscale_${currentSymbol}_to_${nextSymbol}.png`;
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${afterChangeFile}`,
          fullPage: false,
        });
        files.push(afterChangeFile);
        logs.push(`  - After change: ${afterChangeFile}`);
      }
    }

    await browser.close();

    return NextResponse.json({
      success: true,
      logs: logs.join("\n"),
      files: files.map((f) => `/api/debug/y-scale-symbol-change/img?f=${f}`),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
