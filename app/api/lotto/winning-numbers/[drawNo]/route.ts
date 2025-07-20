/* app/api/lotto/winning-numbers/[drawNo]/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getWinningNumbers } from '@/lib/lottoUtils';

/* [수정] 당첨 번호 전용 캐시 파일 경로를 지정합니다. */
const cacheDir = path.join(process.cwd(), '.cache');
const winningNumbersCachePath = path.join(cacheDir, 'winning-numbers.json');

interface WinningNumbersCache {
  [drawNo: number]: {
    numbers: number[];
    bonus: number;
  };
}

/* [수정] 당첨 번호 캐시 파일을 읽고 쓰는 함수들입니다. */
async function readWinningNumbersCache(): Promise<WinningNumbersCache> {
  try {
    await fs.access(winningNumbersCachePath);
    const data = await fs.readFile(winningNumbersCachePath, 'utf8');
    return JSON.parse(data);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(winningNumbersCachePath, JSON.stringify({}, null, 2), 'utf8');
    return {};
  }
}

async function writeWinningNumbersCache(data: WinningNumbersCache): Promise<void> {
  await fs.writeFile(winningNumbersCachePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET(
  request: Request,
) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const drawNoString = pathParts[pathParts.length - 1];
  const drawNo = parseInt(drawNoString, 10);

  if (isNaN(drawNo) || drawNo <= 0) {
    return NextResponse.json({ error: 'Invalid draw number' }, { status: 400 });
  }

  try {
    /* 1. 캐시에서 먼저 조회 */
    const cache = await readWinningNumbersCache();
    if (cache[drawNo]) {
      console.log(`✅ [Draw #${drawNo}] CACHE HIT: Loading winning numbers from cache.`);
      return NextResponse.json(cache[drawNo]);
    }

    /* 2. 캐시에 없으면 API 호출 */
    console.log(`❌ [Draw #${drawNo}] CACHE MISS: Fetching new winning numbers from API.`);
    const winningNumbers = await getWinningNumbers(drawNo);

    /* 3. API 결과를 캐시에 저장 */
    cache[drawNo] = winningNumbers;
    await writeWinningNumbersCache(cache);

    return NextResponse.json(winningNumbers);

  } catch (error) {
    console.error(`API Error fetching winning numbers for draw #${drawNo}:`, error);
    return NextResponse.json({ error: 'Failed to fetch winning numbers' }, { status: 500 });
  }
}
