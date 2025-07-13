/* app/api/lotto/update-result/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { LottoWeek } from '@/types/lotto';
import { getWinningNumbers } from '@/lib/lottoUtils';

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

const firstDrawDate = new Date('2002-12-07T12:00:00Z');

function getCurrentDrawNo(): number {
  const now = new Date();
  const diff = now.getTime() - firstDrawDate.getTime();
  const weeks = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  return weeks;
}

export async function GET() {
  const drawNo = getCurrentDrawNo();
  const winningNumbers = await getWinningNumbers(drawNo);

  if (!winningNumbers) {
    return NextResponse.json({ error: `[${drawNo}회차] 당첨 결과를 가져올 수 없습니다.` }, { status: 500 });
  }

  const db = await readLottoDb();
  let updated = false;

  for (const weekKey in db) {
    const weekData = db[weekKey];
    if (weekData.winningNumbers) continue;

    const weekDrawDate = new Date(weekData.drawDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (weekDrawDate.getTime() === today.getTime()) {
      db[weekKey].winningNumbers = winningNumbers;
      db[weekKey].drawNo = drawNo;
      updated = true;
    }
  }

  if (updated) {
    await writeLottoDb(db);
    return NextResponse.json({
      message: `${drawNo}회차 당첨 번호가 성공적으로 업데이트되었습니다.`,
      data: winningNumbers,
    });
  } else {
    return NextResponse.json({ message: '업데이트할 주차 데이터가 없습니다.' });
  }
}
