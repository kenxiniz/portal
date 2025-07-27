/* lib/lottoUtils.ts */

import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { LottoSet } from '@/types/lotto';

const firstDrawDate = new Date('2002-12-07T21:00:00+09:00');
const cacheDir = path.join(process.cwd(), '.cache');
const pastWinningNumbersPath = path.join(cacheDir, 'past-winning-numbers.json');

export const getDrawNoForDate = (date: Date): number => {
  const diff = date.getTime() - firstDrawDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 7)) + 1;
};

export const getLatestDrawNo = (): number => {
  const now = new Date();
  const todayAt21 = new Date(now);
  todayAt21.setHours(21, 0, 0, 0);

  const targetDate = new Date(now);
  if (now.getDay() === 6 && now < todayAt21) {
    targetDate.setDate(now.getDate() - 1);
  }

  const diff = targetDate.getTime() - firstDrawDate.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 7)) + 1;
};

export const getWinningNumbers = async (drawNo: number) => {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drawNo}`;
      const response = await axios.get(url);
    const data = response.data;

    if (data.returnValue === 'success') {
      const numbers = [
        data.drwtNo1, data.drwtNo2, data.drwtNo3,
        data.drwtNo4, data.drwtNo5, data.drwtNo6,
      ];
      const bonus = data.bnusNo;
      return { numbers, bonus };
    } else {
      if (data.returnValue === 'fail') return null;
      throw new Error(`[${drawNo}회차] 당첨 번호 조회 실패: ${data.returnValue}`);
    }
  } catch (error) {
    console.error(`Error fetching winning numbers for draw #${drawNo}:`, error);
    return null;
  }
};

/* [수정] 함수의 반환 및 인자 타입을 명확히 지정합니다. */
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

export const checkAndUpdateLatestWinningNumbers = async () => {
  try {
    const latestDrawNo = getLatestDrawNo();
    console.log(`[로또 로그] 동행복권 API로 최신 ${latestDrawNo}회차 당첨 번호 조회를 시도합니다...`);

    const winningNumbers = await getWinningNumbers(latestDrawNo);

    if (winningNumbers) {
      console.log(`[로또 로그] ✅ 조회 성공: ${latestDrawNo}회차 당첨 번호는 [${winningNumbers.numbers.join(', ')}] + 보너스 ${winningNumbers.bonus} 입니다.`);

      const pastNumbers = await readJsonFile(pastWinningNumbersPath);
      if (!pastNumbers[latestDrawNo]) {
        console.log(`[로또 로그] ⚠️ ${latestDrawNo}회차 번호가 .cache/past-winning-numbers.json에 없어 새로 추가합니다.`);
        pastNumbers[latestDrawNo] = winningNumbers;
        await writeJsonFile(pastWinningNumbersPath, pastNumbers);
      } else {
        console.log(`[로또 로그] ℹ️ ${latestDrawNo}회차 번호는 이미 파일에 존재합니다.`);
      }

    } else {
      console.log(`[로또 로그] ℹ️ 아직 ${latestDrawNo}회차 당첨 번호가 발표되지 않았습니다.`);
    }
  } catch (error) {
    console.error('[로또 로그] ❌ 최신 당첨 번호 확인/업데이트 중 오류 발생:', error);
  }
};

const generateSingleLottoSet = (): number[] => {
  const balls = Array.from({ length: 45 }, (_, i) => i + 1);
  const pickedNumbers: number[] = [];
  for (let i = 0; i < 6; i++) {
    const pickedBall = balls.splice(Math.floor(Math.random() * balls.length), 1)[0];
    pickedNumbers.push(pickedBall);
  }
  return pickedNumbers.sort((a, b) => a - b);
};

export const generateLottoSets = (count: number): LottoSet[] => {
  return Array.from({ length: count }, () => ({
    numbers: generateSingleLottoSet(),
  }));
};
