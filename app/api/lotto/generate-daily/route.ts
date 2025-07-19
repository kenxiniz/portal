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
  } catch {
    return {};
  }
}

async function writeLottoDb(data: Record<string, LottoWeek>): Promise<void> {
  await fs.writeFile(lottoDbPath, JSON.stringify(data, null, 2), 'utf8');
}

export async function POST() {
  const week = getCurrentWeek();
  const db = await readLottoDb();

  /* 해당 주차 데이터가 없으면 초기화 */
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

  const dayOfWeek = new Date().getDay(); /* 일요일=0, 월요일=1 */
  const weekData = db[week];
  const hasUnusedSets = weekData.generatedSets.some(set => !set.used);

  /* 월요일이고, 아직 생성된 번호가 없을 때만 실행 */
  if (dayOfWeek === 1 && weekData.generatedSets.length === 0) {
    const newSets = generateLottoSets(25);
    weekData.generatedSets = newSets;
    await writeLottoDb(db);

    return NextResponse.json({ 
      message: `${week} 주차에 25개 번호 세트 생성.`, 
      week: week,
      setsToSend: newSets /* 새로 생성된 번호 전체를 반환 */
    }, { status: 201 });
  } 

  /* 월요일인데, 아직 사용되지 않은(알림이 가지 않은) 번호가 있다면, 해당 번호를 반환하여 알림을 보낼 수 있도록 함 */
  if (dayOfWeek === 1 && hasUnusedSets) {
    const unusedSets = weekData.generatedSets.filter(set => !set.used);
    return NextResponse.json({ 
      message: `${week} 주차에 아직 사용 처리되지 않은 ${unusedSets.length}개의 세트가 있습니다.`, 
      week: week,
      setsToSend: unusedSets
    }, { status: 200 });
  }

  /* 그 외의 경우 (월요일이 아니거나, 이미 모든 번호가 사용 처리된 경우) */
  return NextResponse.json({ 
    message: '오늘은 번호를 생성하는 날이 아니거나, 이미 생성 및 발송 완료되었습니다.',
    week: week,
    setsToSend: [] 
  }, { status: 200 });
}
