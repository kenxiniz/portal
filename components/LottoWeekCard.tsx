/* components/LottoWeekCard.tsx */

'use client';

import { LottoSet, LottoWeek } from "@/types/lotto";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LottoBall } from "./LottoBall";
import { Award, CalendarDays } from "lucide-react";

interface LottoWeekCardProps {
  weekData: LottoWeek;
}

const LottoSetDisplay: React.FC<{
  set: LottoSet;
  winningNumbers?: number[];
  bonusNumber?: number;
}> = ({ set, winningNumbers, bonusNumber }) => {
  const matchCount = set.numbers.filter(num => winningNumbers?.includes(num)).length;
  const bonusMatch = bonusNumber ? set.numbers.includes(bonusNumber) : false;

  let rank = "";
  if (winningNumbers) {
    if (matchCount === 6) rank = "1등 🎉";
    else if (matchCount === 5 && bonusMatch) rank = "2등 🥈";
    else if (matchCount === 5) rank = "3등 🥉";
    else if (matchCount === 4) rank = "4등";
    else if (matchCount === 3) rank = "5등";
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 my-2">
    <div className="flex space-x-2">
    {set.numbers.map((num) => (
      <LottoBall
      key={num}
      number={num}
      isWinning={winningNumbers?.includes(num)}
      isBonus={num === bonusNumber}
      />
    ))}
    </div>
    {rank && (
      <div className="mt-2 sm:mt-0 sm:ml-4 px-3 py-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded-full text-sm font-semibold">
      {rank}
      </div>
    )}
    </div>
  );
};

export const LottoWeekCard: React.FC<LottoWeekCardProps> = ({ weekData }) => {
  const { week, drawDate, generatedSets, winningNumbers, drawNo } = weekData;
  const winningNums = winningNumbers?.numbers;
  const bonusNum = winningNumbers?.bonus;
  const days = ["월요일", "화요일", "수요일", "목요일", "금요일"];

  return (
    <AccordionItem value={week} className="border bg-white dark:bg-slate-900 rounded-lg shadow-sm">
    <AccordionTrigger className="text-xl font-bold text-slate-800 dark:text-slate-200 hover:no-underline p-6">
    <div className="flex justify-between items-center w-full">
    <h2 className="text-2xl font-bold">{week} 주차</h2>
    <span className="text-sm text-slate-500 dark:text-slate-400">{drawDate} 추첨</span>
    </div>
    </AccordionTrigger>
    <AccordionContent className="p-6 pt-2">
    <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/30">
    <h3 className="text-lg font-semibold text-center mb-3 flex items-center justify-center gap-2">
    <Award className="h-5 w-5 text-blue-500" />
    {drawNo ? `${drawNo}회 당첨 결과` : '당첨 결과 대기 중'}
    </h3>
    {winningNums && bonusNum ? (
      <div className="flex items-center justify-center space-x-2">
      {winningNums.map(num => <LottoBall key={`win-${num}`} number={num} isWinning />)}
      <span className="text-2xl font-bold mx-2">+</span>
      <LottoBall number={bonusNum} isBonus />
      </div>
    ) : (
    <p className="text-center text-sm text-slate-500">토요일 저녁 9시 5분에 결과가 업데이트됩니다.</p>
    )}
    </div>
    <div className="space-y-4">
    {days.map((day, dayIndex) => {
      const startIndex = dayIndex * 5;
      const endIndex = startIndex + 5;
      const dailySets = generatedSets.slice(startIndex, endIndex);

      if (dailySets.length === 0) return null;

      return (
        <div key={day}>
        <h4 className="font-semibold text-md flex items-center gap-2 mb-2">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        {day} 생성 번호
        </h4>
        {dailySets.map((set, setIndex) => (
          <LottoSetDisplay
          key={setIndex}
          set={set}
          winningNumbers={winningNums}
          bonusNumber={bonusNum}
          />
        ))}
        </div>
      );
    })}
    </div>
    </div>
    </AccordionContent>
    </AccordionItem>
  );
};
