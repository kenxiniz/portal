/* app/api/lotto/update-winning-numbers/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { getWinningNumbers, getLatestDrawNo } from '@/lib/lottoUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const pastWinningNumbersPath = path.join(cacheDir, 'past-winning-numbers.json');

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  const drawNo = getLatestDrawNo();

  console.log(`[update-winning-numbers] ${drawNo}회차 당첨 번호 업데이트 시도...`);

  const pastNumbers = await readJsonFile(pastWinningNumbersPath);

  if (pastNumbers[drawNo]) {
    const message = `이미 ${drawNo}회차 당첨 번호가 저장되어 있습니다.`;
    console.log(`[update-winning-numbers] ${message}`);
    return NextResponse.json({ message });
  }

  const winningNumbers = await getWinningNumbers(drawNo);

  if (!winningNumbers) {
    const errorMsg = `[${drawNo}회차] 당첨 결과를 가져올 수 없거나 아직 발표되지 않았습니다.`;
    console.error(`[update-winning-numbers] ${errorMsg}`);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }

  pastNumbers[drawNo] = winningNumbers;
  await writeJsonFile(pastWinningNumbersPath, pastNumbers);

  const successMsg = `${drawNo}회차 당첨 번호가 past-winning-numbers.json에 성공적으로 업데이트되었습니다.`;
  console.log(`[update-winning-numbers] ${successMsg}`);
  return NextResponse.json({
    message: successMsg,
    data: winningNumbers,
  });
}
