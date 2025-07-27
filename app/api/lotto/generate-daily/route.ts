/* app/api/lotto/generate-daily/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { generateLottoSets } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');
const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');

/* 다음 추첨일의 정보를 계산하는 함수 */
const getNextDrawInfo = (): { week: string, drawNo: number, drawDate: string } => {
  const now = new Date();
  /* 오늘로부터 가장 가까운 다음 토요일을 찾습니다. */
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const nextSaturday = new Date(now);
  nextSaturday.setDate(now.getDate() + daysUntilSaturday);
  nextSaturday.setHours(21, 0, 0, 0);

  /* 다음 토요일을 기준으로 회차를 계산합니다. */
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

/* ... (readLottoDb, writeLottoDb 함수는 기존과 동일) ... */
async function readLottoDb(): Promise<Record<string, LottoWeek>> {
  try {
    await fs.access(lottoDbPath);
    const data = await fs.readFile(lottoDbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(lottoDbPath, JSON.stringify({}, null, 2), 'utf8');
    return {};
  }
}

async function writeLottoDb(data: Record<string, LottoWeek>): Promise<void> {
  await fs.writeFile(lottoDbPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function POST() {
  const { week, drawNo, drawDate } = getNextDrawInfo();
  const db = await readLottoDb();

  const existingData = Object.values(db).find(w => w.drawNo === drawNo);

  if (!existingData) {
    const newSets = generateLottoSets(5);
    db[week] = {
      week,
      drawDate,
      drawNo,
      generatedSets: newSets,
    };
    await writeLottoDb(db);

    return NextResponse.json({
      message: `${drawNo}회차(${week}) 신규 번호 생성 완료.`,
      week: week,
      setsToSend: newSets
    }, { status: 201 });
  }

  return NextResponse.json({
    message: `이미 ${drawNo}회차(${week}) 번호가 존재합니다.`,
    week: week,
    setsToSend: []
  }, { status: 200 });
}
