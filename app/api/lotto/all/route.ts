/* app/api/lotto/all/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { generateLottoSets, getDrawNoForDate, checkAndUpdateLatestWinningNumbers } from '@/lib/lottoUtils';
import { LottoWeek } from '@/types/lotto';

export const dynamic = 'force-dynamic';

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');
const pastWinningNumbersPath = path.join(cacheDir, 'past-winning-numbers.json');
const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');

const getNextDrawInfo = (): { week: string, drawNo: number, drawDate: string } => {
  const now = new Date();
  const todayAt21 = new Date(now);
  todayAt21.setHours(21, 0, 0, 0);

  const nextSaturday = new Date(now);

  if (now.getDay() === 6 && now >= todayAt21) {
    nextSaturday.setDate(now.getDate() + 7);
  } else {
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  }
  nextSaturday.setHours(21, 0, 0, 0);

  const diff = nextSaturday.getTime() - firstDrawDate.getTime();
  const drawNo = Math.floor(diff / (1000 * 60 * 60 * 24 * 7)) + 1;

  const startOfYear = new Date(nextSaturday.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((nextSaturday.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const weekNo = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

  return {
    week: `${nextSaturday.getFullYear()}-${String(weekNo).padStart(2, '0')}`,
    drawNo: drawNo,
    drawDate: nextSaturday.toISOString().split('T')[0]
  };
};

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeJsonFile(filePath, {});
      return {};
    }
    return {};
  }
}

async function writeJsonFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  await checkAndUpdateLatestWinningNumbers();

  let lottoDb = await readJsonFile(lottoDbPath) as Record<string, LottoWeek>;
  const { week, drawNo, drawDate } = getNextDrawInfo();

  const existingDataForNextDraw = Object.values(lottoDb).find((w) => w.drawNo === drawNo);
  if (!existingDataForNextDraw) {
    console.log(`[로또 번호 생성] ${drawNo}회차(${week}) 번호가 없어 새로 생성합니다.`);
    const newSets = generateLottoSets(5);
    lottoDb[week] = {
      week,
      drawDate,
      drawNo,
      generatedSets: newSets,
    };
    await writeJsonFile(lottoDbPath, lottoDb);
    lottoDb = await readJsonFile(lottoDbPath) as Record<string, LottoWeek>;
  } else {
    console.log(`[로또 번호 생성] 이미 ${drawNo}회차(${week}) 번호가 존재하여 건너뜁니다.`);
  }

  const pastWinningNumbers = await readJsonFile(pastWinningNumbersPath) as Record<string, { numbers: number[], bonus: number }>;

  const combinedData = Object.values(lottoDb).map((weekData) => {
    const currentDrawNo = weekData.drawNo || getDrawNoForDate(new Date(weekData.drawDate));
    const winningInfo = weekData.winningNumbers || pastWinningNumbers[currentDrawNo];

    return { 
      ...weekData, 
      drawNo: currentDrawNo,
      winningNumbers: winningInfo || null 
    };
  });

  const sortedData = combinedData.sort((a, b) => b.drawNo - a.drawNo);

  const finalData = sortedData.map(weekData => {
    const previousDrawNo = weekData.drawNo - 1;
    const previousWeekWinningNumbers = pastWinningNumbers[previousDrawNo] || null;
    const prevWinningInfo = previousWeekWinningNumbers ? {
      drawNo: previousDrawNo,
      ...previousWeekWinningNumbers
    } : null;
    return { ...weekData, previousWeekWinningInfo: prevWinningInfo };
  });

  return NextResponse.json(finalData);
}
