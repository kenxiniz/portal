/* app/api/lotto/winning-numbers/[drawNo]/route.ts */

import { NextResponse, NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getWinningNumbers } from '@/lib/lottoUtils';

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

export async function GET(request: NextRequest) {
  /*
   *    * [수정] 문제가 되던 두 번째 인자를 제거하고, request 객체에서 직접 URL을 파싱하여 drawNo를 추출합니다.
   *       */
  const { pathname } = request.nextUrl;
  const pathSegments = pathname.split('/');
  const drawNo = pathSegments[pathSegments.length - 1];

  if (!drawNo || isNaN(Number(drawNo))) {
    return NextResponse.json({ error: '유효한 회차 번호가 필요합니다.' }, { status: 400 });
  }

  /* 1. 캐시에서 먼저 찾아봅니다. */
  const cache = await readWinningNumbersCache();
  if (cache[drawNo]) {
    console.log(`[Cache HIT] Draw #${drawNo}`);
    return NextResponse.json(cache[drawNo]);
  }

  console.log(`[Cache MISS] Draw #${drawNo}. Fetching from API...`);

  /* 2. 캐시에 없으면 API를 호출합니다. */
  const winningNumbers = await getWinningNumbers(Number(drawNo));

  if (!winningNumbers) {
    return NextResponse.json({
      error: `${drawNo}회차의 당첨 번호를 가져올 수 없거나 아직 발표되지 않았습니다.`
    }, { status: 404 });
  }

  /* 3. API 결과를 캐시에 저장합니다. */
  cache[drawNo] = winningNumbers;
  await writeWinningNumbersCache(cache);

  return NextResponse.json(winningNumbers);
}
