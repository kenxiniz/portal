/* components/LottoWeekCard.tsx */

'use client';

import { LottoSet, LottoWeek } from "@/types/lotto";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LottoBall } from "./LottoBall";
import { Award, CalendarDays, History, Trophy } from "lucide-react";

interface PrevWinningInfo {
  drawNo: number;
  numbers: number[];
  bonus: number;
}

interface LottoWeekCardProps {
  weekData: LottoWeek & { previousWeekWinningInfo?: PrevWinningInfo | null };
}

const LottoSetDisplay: React.FC<{
  set: LottoSet;
  winningNumbers?: number[];
  bonusNumber?: number;
}> = ({ set, winningNumbers, bonusNumber }) => {
  const matchCount = set.numbers.filter(num => winningNumbers?.includes(num)).length;
  const bonusMatch = bonusNumber ? set.numbers.includes(bonusNumber) : false;

  let rank = "";
  let rankStyle = "";
  if (winningNumbers) {
    if (matchCount === 6) { rank = "1등 🎉"; rankStyle="bg-yellow-400 text-yellow-900 border-yellow-500"; }
    else if (matchCount === 5 && bonusMatch) { rank = "2등 🥈"; rankStyle="bg-gray-300 text-gray-800 border-gray-400"; }
    else if (matchCount === 5) { rank = "3등 🥉"; rankStyle="bg-orange-400 text-orange-900 border-orange-500"; }
    else if (matchCount === 4) { rank = "4등"; rankStyle="bg-blue-200 text-blue-800 border-blue-300"; }
    else if (matchCount === 3) { rank = "5등"; rankStyle="bg-green-200 text-green-800 border-green-300"; }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-slate-800 my-2 min-h-[56px]">
    {/* [수정] 등수 표시 (왼쪽) */}
    <div className="flex-1 flex justify-center sm:justify-start order-2 sm:order-1 mt-2 sm:mt-0">
    {rank && (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border-2 ${rankStyle}`}>
      <Trophy className="h-4 w-4" />
      <span>{rank}</span>
      </div>
    )}
    </div>

    {/* 로또 공 (중앙) */}
    <div className="flex-shrink-0 flex space-x-2 order-1 sm:order-2">
    {set.numbers.map((num) => (
      <LottoBall
      key={num}
      number={num}
      isWinning={winningNumbers?.includes(num)}
      isBonus={num === bonusNumber}
      />
    ))}
    </div>

    {/* 오른쪽 공간 (데스크탑에서 중앙 정렬을 위한 빈 공간) */}
    <div className="hidden sm:flex flex-1 order-3" />
    </div>
  );
};

export const LottoWeekCard: React.FC<LottoWeekCardProps> = ({ weekData }) => {
  const { week, drawDate, generatedSets, winningNumbers, drawNo, previousWeekWinningInfo } = weekData;
  const winningNums = winningNumbers?.numbers;
  const bonusNum = winningNumbers?.bonus;

  return (
    <AccordionItem value={week} className="border bg-white dark:bg-slate-900 rounded-lg shadow-sm">
    <AccordionTrigger className="text-xl font-bold text-slate-800 dark:text-slate-200 hover:no-underline p-6">
    <div className="flex justify-between items-center w-full">
    <div className="flex flex-col items-start text-left">
    <h2 className="text-2xl font-bold">{drawNo}회차</h2>
    {week && <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">({week})</span>}
    </div>
    <span className="text-sm text-slate-500 dark:text-slate-400">{drawDate} 추첨</span>
    </div>
    </AccordionTrigger>
    <AccordionContent className="p-6 pt-2">
    <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/30">
    <h3 className="text-lg font-semibold text-center mb-3 flex items-center justify-center gap-2">
    <Award className="h-5 w-5 text-blue-500" />
    {drawNo}회 당첨 결과
    </h3>
    {winningNums && bonusNum ? (
      <div className="flex items-center justify-center space-x-2">
      {winningNums.map(num => <LottoBall key={`win-${num}`} number={num} />)}
      <span className="text-2xl font-bold mx-2">+</span>
      <LottoBall number={bonusNum} isBonus />
      </div>
    ) : (
    <p className="text-center text-sm text-slate-500">당첨 결과 대기 중</p>
    )}
    </div>

    {previousWeekWinningInfo && (
      <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800">
      <h3 className="text-md font-semibold text-center mb-3 flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300">
      <History className="h-4 w-4" />
      {previousWeekWinningInfo.drawNo}회 당첨 결과
      </h3>
      <div className="flex items-center justify-center space-x-2 opacity-80">
      {previousWeekWinningInfo.numbers.map(num => (
        <LottoBall key={`prev-win-${num}`} number={num} />
      ))}
      <span className="text-2xl font-bold mx-2">+</span>
      <LottoBall number={previousWeekWinningInfo.bonus} isBonus={true} />
      </div>
      </div>
    )}

    <div className="space-y-4">
    {generatedSets && generatedSets.length > 0 && (
      <div>
      <h4 className="font-semibold text-md flex items-center gap-2 mb-2">
      <CalendarDays className="h-4 w-4 text-slate-500" />
      생성된 번호
      </h4>
      {generatedSets.map((set, setIndex) => (
        <LottoSetDisplay
        key={setIndex}
        set={set}
        winningNumbers={winningNums}
        bonusNumber={bonusNum}
        />
      ))}
      </div>
    )}
    </div>
    </div>
    </AccordionContent>
    </AccordionItem>
  );
};
