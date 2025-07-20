/* app/api/lotto/past-wins/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getWinningNumbers } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const pastWinningNumbersCachePath = path.join(cacheDir, 'past-winning-numbers.json');

interface PastWinningNumbersCache {
  [drawNo: number]: {
    numbers: number[];
    bonus: number;
  };
}

async function readPastWinningNumbersCache(): Promise<PastWinningNumbersCache> {
  try {
    await fs.access(pastWinningNumbersCachePath);
    const data = await fs.readFile(pastWinningNumbersCachePath, 'utf8');
    return JSON.parse(data);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(pastWinningNumbersCachePath, JSON.stringify({}, null, 2), 'utf8');
    return {};
  }
}

async function writePastWinningNumbersCache(data: PastWinningNumbersCache): Promise<void> {
  await fs.writeFile(pastWinningNumbersCachePath, JSON.stringify(data, null, 2), 'utf8');
}

const firstDrawDate = new Date('2002-12-07T12:00:00Z');
const getLatestDrawNo = (currentDate: Date): number => {
  const diff = currentDate.getTime() - firstDrawDate.getTime();
  let weeks = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  const dayOfWeek = currentDate.getDay();
  const hours = currentDate.getHours();
  if (dayOfWeek === 6 && hours < 21) {
    weeks -= 1;
  }
  return weeks;
};

export async function GET() {
  try {
    const cache = await readPastWinningNumbersCache();
    const latestDrawNo = getLatestDrawNo(new Date());

    if (Object.keys(cache).length >= latestDrawNo) {
      console.log(`✅ CACHE HIT: Loading all past winning numbers from cache.`);
      return NextResponse.json(cache);
    }

    console.log(`❌ CACHE MISS or OUTDATED: Fetching all past winning numbers from API up to draw #${latestDrawNo}.`);
    for (let i = 1; i <= latestDrawNo; i++) {
      if (!cache[i]) {
        try {
          /* [추가] 동행복권 API 호출 시 서버 콘솔에 로그를 남깁니다. */
          console.log(`[API Call] Fetching winning numbers for draw #${i}...`);
          const winningNumbers = await getWinningNumbers(i);
          cache[i] = winningNumbers;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) {
          console.error(`Failed to fetch draw #${i}, skipping...`);
        }
      }
    }

    await writePastWinningNumbersCache(cache);
    console.log('✅ Successfully updated and saved all past winning numbers to cache.');
    return NextResponse.json(cache);

  } catch (error) {
    console.error(`API Error fetching all past winning numbers:`, error);
    return NextResponse.json({ error: 'Failed to fetch all past winning numbers' }, { status: 500 });
  }
}
