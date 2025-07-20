/* app/api/lotto/generate-daily/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { generateLottoSets } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');

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
  const week = getCurrentWeek();
  const db = await readLottoDb();

  /* [수정] 해당 주차 데이터가 없거나, 있어도 생성된 세트가 없는 경우에만 신규 생성 */
  if (!db[week] || db[week].generatedSets.length === 0) {
    const [year, weekNum] = week.split('-').map(Number);
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (weekNum - 1) * 7 + (6 - firstDayOfYear.getDay() + 1);
    const drawDate = new Date(year, 0, days);

    const newSets = generateLottoSets(5); // 5세트 생성

    db[week] = {
      week,
      drawDate: drawDate.toISOString().split('T')[0],
      generatedSets: newSets,
    };
    await writeLottoDb(db);

    return NextResponse.json({
      message: `${week} 주차에 5개 세트를 새로 생성했습니다.`,
      week: week,
      setsToSend: newSets, // 스케줄러가 발송할 수 있도록 번호 반환
    }, { status: 201 });
  }

  /* 이미 생성된 번호가 있는 경우 */
  const unusedSets = db[week].generatedSets.filter(set => !set.used);
  if (unusedSets.length > 0) {
    return NextResponse.json({
      message: `${week} 주차에 아직 사용 처리되지 않은 ${unusedSets.length}개의 세트가 있습니다.`,
      week: week,
      setsToSend: unusedSets,
    }, { status: 200 });
  }

  return NextResponse.json({
    message: '이미 이번 주 번호가 생성 및 발송 완료되었습니다.',
    week: week,
    setsToSend: [],
  }, { status: 200 });
}
