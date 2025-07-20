/* app/api/lotto/[week]/route.ts */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { generateLottoSets } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');

export const dynamic = 'force-dynamic';

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
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(lottoDbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Error writing lotto cache file:", error);
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const week = pathParts[pathParts.length - 1];

  if (!week) {
    return NextResponse.json({ error: 'Week parameter is missing' }, { status: 400 });
  }

  const db = await readLottoDb();
  let weekData = db[week];

  /* [수정] 데이터가 없거나 생성된 세트가 없는 경우, 5세트를 새로 생성 */
  if (!weekData || weekData.generatedSets.length === 0) {
    console.log(`[GET /api/lotto/${week}] No data found. Generating 5 new lotto sets.`);
    const [year, weekNum] = week.split('-').map(Number);
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (weekNum - 1) * 7 + (6 - firstDayOfYear.getDay() + 1);
    const drawDate = new Date(year, 0, days);
    const drawDateString = drawDate.toISOString().split('T')[0];

    /* 페이지 접속으로 생성된 번호는 발송되지 않도록 used: true로 처리 */
    const newSets = generateLottoSets(5).map(set => ({ ...set, used: true }));

    const newWeekData: LottoWeek = {
      week,
      drawDate: drawDateString,
      generatedSets: newSets,
    };

    db[week] = newWeekData;
    await writeLottoDb(db);
    weekData = newWeekData;

    return NextResponse.json(weekData, { status: 201 });
  }

  return NextResponse.json(weekData);
}

// POST 함수는 변경 사항 없음 (기존 코드 유지)
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

  const newSets = await generateLottoSets(5);
  const newWeekData: LottoWeek = {
    week,
    drawDate: drawDateString,
    generatedSets: newSets,
  };

  db[week] = newWeekData;
  await writeLottoDb(db);

  return NextResponse.json(newWeekData, { status: 201 });
}
