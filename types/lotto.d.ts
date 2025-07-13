/* types/lotto.d.ts */

/* 한 세트의 로또 번호를 정의합니다. */
export interface LottoSet {
  numbers: number[];
  used?: boolean; /* [추가] 카카오톡 메시지 발송 여부를 추적합니다. */
}

/* 주차별 로또 데이터를 정의합니다. */
export interface LottoWeek {
  week: string; /* YYYY-WW 형식 (예: 2023-34) */
  drawDate: string; /* YYYY-MM-DD 형식 */
  generatedSets: LottoSet[];
  winningNumbers?: {
    numbers: number[];
    bonus: number;
  };
  drawNo?: number;
}
