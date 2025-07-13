/* app/api/lotto/generate-daily/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { generateLottoSets } from '@/lib/lottoUtils';

const lottoDbPath = path.join(process.cwd(), 'lib', 'lotto.json');

const getCurrentWeek = (): string => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime() + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  const week = Math.ceil((day + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-${String(week).padStart(2, '0')}`;
};

async function readLottoDb(): Promise<Record<string, LottoWeek>> {
  try {
    const data = await fs.readFile(lottoDbPath, 'utf8');
    return JSON.parse(data);
  } catch { // [수정] 사용하지 않는 error 변수 제거
    return {};
  }
}

async function writeLottoDb(data: Record<string, LottoWeek>): Promise<void> {
  await fs.writeFile(lottoDbPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function POST() {
  const week = getCurrentWeek();
  const db = await readLottoDb();

  if (!db[week]) {
    const [year, weekNum] = week.split('-').map(Number);
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (weekNum - 1) * 7 + (6 - firstDayOfYear.getDay() + 1);
    const drawDate = new Date(year, 0, days);

    db[week] = {
      week,
      drawDate: drawDate.toISOString().split('T')[0],
      generatedSets: [],
    };
  }

  const dayOfWeek = new Date().getDay();
  const currentSetsCount = db[week].generatedSets.length;

  if (dayOfWeek >= 1 && dayOfWeek <= 5 && currentSetsCount < dayOfWeek * 5) {
    const newSets = generateLottoSets(5);
    db[week].generatedSets.push(...newSets);
    await writeLottoDb(db);

    return NextResponse.json({ 
      message: `${week} 주차에 5개 번호 세트 추가.`, 
      week: week,
      setsToSend: newSets 
    }, { status: 201 });
  } else {
    return NextResponse.json({ 
      message: '오늘은 번호를 생성하는 날이 아니거나, 이미 생성되었습니다.',
      week: week,
      setsToSend: [] 
    }, { status: 200 });
  }
}
