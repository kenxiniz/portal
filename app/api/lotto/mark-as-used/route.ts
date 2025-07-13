/* app/api/lotto/mark-as-used/route.ts */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';

const lottoDbPath = path.join(process.cwd(), 'lib', 'lotto.json');

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

export async function POST(request: NextRequest) {
  const { week, usedSets } = await request.json();

  if (!week || !Array.isArray(usedSets)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const db = await readLottoDb();
  const weekData = db[week];

  if (!weekData) {
    return NextResponse.json({ error: 'Week data not found' }, { status: 404 });
  }

  const usedNumberStrings = usedSets.map((s: number[]) => JSON.stringify(s.sort((a,b)=>a-b)));

  weekData.generatedSets.forEach(set => {
    const setString = JSON.stringify(set.numbers.sort((a,b)=>a-b));
    if (usedNumberStrings.includes(setString)) {
      set.used = true;
    }
  });

  await writeLottoDb(db);

  return NextResponse.json({ message: `${week} 주차의 ${usedSets.length}개 세트가 사용 처리되었습니다.` });
}
