/* app/api/lotto/[week]/route.ts */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { generateLottoSets } from '@/lib/lottoUtils';

const lottoDbPath = path.join(process.cwd(), 'lib', 'lotto.json');

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const week = pathParts[pathParts.length - 1];

  if (!week) {
    return NextResponse.json({ error: 'Week parameter is missing' }, { status: 400 });
  }

  const db = await readLottoDb();
  const weekData = db[week];

  if (weekData) {
    return NextResponse.json(weekData);
  } else {
    return NextResponse.json({ message: '해당 주차의 데이터가 없습니다.' }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const week = pathParts[pathParts.length - 1];

  if (!week) {
    return NextResponse.json({ error: 'Week parameter is missing' }, { status: 400 });
  }

  const db = await readLottoDb();

  if (db[week]) {
    return NextResponse.json(db[week], { status: 200 });
  }

  const [year, weekNum] = week.split('-').map(Number);
  const firstDayOfYear = new Date(year, 0, 1);
  const days = (weekNum - 1) * 7 + (6 - firstDayOfYear.getDay() + 1);
  const drawDate = new Date(year, 0, days);
  const drawDateString = drawDate.toISOString().split('T')[0];

  const newSets = generateLottoSets(5);
  const newWeekData: LottoWeek = {
    week,
    drawDate: drawDateString,
    generatedSets: newSets,
  };

  db[week] = newWeekData;
  await writeLottoDb(db);

  return NextResponse.json(newWeekData, { status: 201 });
}
