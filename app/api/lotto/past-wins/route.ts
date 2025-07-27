/* app/api/lotto/past-wins/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getLatestDrawNo, getWinningNumbers } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const pastWinningNumbersPath = path.join(cacheDir, 'past-winning-numbers.json');

interface WinningNumbers {
  numbers: number[];
  bonus: number;
}

async function readWinningNumbersCache(): Promise<Record<string, WinningNumbers>> {
  try {
    await fs.access(pastWinningNumbersPath);
    const data = await fs.readFile(pastWinningNumbersPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeWinningNumbersCache(data: Record<string, WinningNumbers>): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(pastWinningNumbersPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  const latestDrawNo = getLatestDrawNo();
  const cache = await readWinningNumbersCache();
  const cachedDraws = Object.keys(cache).map(Number);
  const latestCachedDraw = cachedDraws.length > 0 ? Math.max(...cachedDraws) : 0;

  if (latestDrawNo <= latestCachedDraw) {
    return NextResponse.json({
      message: `이미 최신(${latestCachedDraw}회)까지의 당첨 번호가 저장되어 있습니다.`,
      latestDrawNo: latestDrawNo,
      latestCachedDraw: latestCachedDraw
    });
  }

  console.log(`[past-wins] Missing draws found. Fetching from draw #${latestCachedDraw + 1} to #${latestDrawNo}...`);

  for (let i = latestCachedDraw + 1; i <= latestDrawNo; i++) {
    try {
      console.log(`[API Call] Fetching winning numbers for draw #${i}...`);
      const winningNumbers = await getWinningNumbers(i);

      /* [수정] winningNumbers가 null이 아닐 때만 cache에 저장합니다. */
      if (winningNumbers) {
        cache[i] = winningNumbers;
      } else {
        console.warn(`[API Call] No data for draw #${i}, skipping...`);
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    } catch {
      console.error(`Failed to fetch draw #${i}, skipping...`);
    }
  }

  await writeWinningNumbersCache(cache);

  return NextResponse.json({
    message: `성공적으로 ${latestDrawNo}회차까지 당첨 번호를 업데이트했습니다.`,
    updatedFrom: latestCachedDraw + 1,
    updatedTo: latestDrawNo
  });
}
