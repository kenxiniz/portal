/* lib/lottoUtils.ts */

import axios from 'axios';
import { LottoSet } from '@/types/lotto';

/**
 *  * 로또 추첨과 동일한 방식으로, 중복 없이 6개의 숫자를 순차적으로 뽑습니다.
 *   * 1. 1부터 45까지의 숫자가 담긴 '공' 배열을 생성합니다.
 *    * 2. 배열에서 무작위로 하나의 인덱스를 선택해 숫자를 뽑고, 그 숫자는 배열에서 제거합니다.
 *     * 3. 이 과정을 6번 반복하여 완벽한 비복원추출을 구현합니다.
 *      * @returns 6개의 고유한 숫자로 이루어진 배열
 *       */
const generateSingleLottoSet = (): number[] => {
  const balls = Array.from({ length: 45 }, (_, i) => i + 1);
  const pickedNumbers: number[] = [];
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * balls.length);
    const pickedBall = balls.splice(randomIndex, 1)[0];
    pickedNumbers.push(pickedBall);
  }
  return pickedNumbers.sort((a, b) => a - b);
};

/**
 *  * 지정된 개수만큼 로또 번호 세트를 생성합니다.
 *   * [수정] 생성된 각 세트에 used: false 속성을 추가합니다.
 *    * @param count 생성할 로또 번호 세트의 개수
 *     * @returns LottoSet 객체 배열
 *      */
export const generateLottoSets = (count: number): LottoSet[] => {
  return Array.from({ length: count }, () => ({
    numbers: generateSingleLottoSet(),
    used: false, /* 메시지 발송 추적을 위해 기본값 false로 설정 */
  }));
};

/**
 *  * 동행복권 API를 통해 특정 회차의 당첨 번호를 가져옵니다.
 *   * @param drawNo 조회할 로또 회차
 *    * @returns 당첨 번호와 보너스 번호가 담긴 객체
 *     */
export const getWinningNumbers = async (drawNo: number) => {
  try {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drawNo}`;
      const response = await axios.get(url);
    const data = response.data;

    if (data.returnValue === 'success') {
      const numbers = [
        data.drwtNo1,
        data.drwtNo2,
        data.drwtNo3,
        data.drwtNo4,
        data.drwtNo5,
        data.drwtNo6,
      ];
      const bonus = data.bnusNo;
      return { numbers, bonus };
    } else {
      throw new Error(`[${drawNo}회차] 당첨 번호 조회 실패: ${data.returnValue}`);
    }
  } catch (error) {
    console.error(`Error fetching winning numbers for draw #${drawNo}:`, error);
    return null;
  }
};
