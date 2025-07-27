/* app/api/lotto/update-result/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getWinningNumbers } from '@/lib/lottoUtils';
import { LottoWeek } from '@/types/lotto';

const cacheDir = path.join(process.cwd(), '.cache');
const lottoDbPath = path.join(cacheDir, 'lotto.json');

async function readLottoDb(): Promise<Record<string, LottoWeek>> {
  try {
    await fs.access(lottoDbPath);
    const data = await fs.readFile(lottoDbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
    return {};
  }
}

async function writeLottoDb(data: Record<string, LottoWeek>): Promise<void> {
  await fs.writeFile(lottoDbPath, JSON.stringify(data, null, 2), 'utf8');
}

const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');

function getDrawNoForDate(date: Date): number {
  const diff = date.getTime() - firstDrawDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 7)) + 1;
}

export async function GET() {
  const today = new Date();
  const drawNo = getDrawNoForDate(today);
  const winningNumbers = await getWinningNumbers(drawNo);

  if (!winningNumbers) {
    return NextResponse.json({ error: `[${drawNo}회차] 당첨 결과를 가져올 수 없습니다.` }, { status: 500 });
  }

  const db = await readLottoDb();

  const weekToUpdate = Object.values(db).find(w => w.drawNo === drawNo && !w.winningNumbers);

  if (weekToUpdate) {
    db[weekToUpdate.week].winningNumbers = winningNumbers;
    await writeLottoDb(db);
    return NextResponse.json({
      message: `${drawNo}회차 당첨 번호가 성공적으로 업데이트되었습니다.`,
      data: winningNumbers,
    });
  } else {
    return NextResponse.json({ message: '이미 업데이트되었거나 업데이트할 주차 데이터가 없습니다.' });
  }
}
