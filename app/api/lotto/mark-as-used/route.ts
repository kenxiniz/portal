/* app/api/lotto/mark-as-used/route.ts */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';

/* [수정] 데이터베이스 경로를 .cache 폴더로 변경합니다. */
const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');

async function readLottoDb(): Promise<Record<string, LottoWeek>> {
  try {
    const data = await fs.readFile(lottoDbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    /* 이 API는 데이터가 반드시 존재할 때 호출되므로, 오류 발생 시 빈 객체 반환 */
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
