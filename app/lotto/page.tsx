/* app/lotto/page.tsx */

'use client';

import { useState, useEffect } from 'react';
import { LottoWeekCard } from '@/components/LottoWeekCard';
import { Accordion } from "@/components/ui/accordion";
import { LottoWeek } from '@/types/lotto';
import { Ticket } from 'lucide-react';
import { LottoMethodology } from '@/components/LottoMethodology';

const getWeekString = (date: Date): string => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = (date.getTime() - start.getTime() + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  const week = Math.ceil((day + start.getDay() + 1) / 7);
  return `${date.getFullYear()}-${String(week).padStart(2, '0')}`;
};

const firstDrawDate = new Date('2002-12-07T12:00:00Z');
const getLatestDrawNo = (currentDate: Date): number => {
  const diff = currentDate.getTime() - firstDrawDate.getTime();
  let weeks = Math.ceil(diff / (1000 * 60 * 60 * 24 * 7));
  const dayOfWeek = currentDate.getDay();
  const hours = currentDate.getHours();
  if (dayOfWeek === 6 && hours < 21) {
    weeks -= 1;
  }
  return weeks;
};

export default function LottoPage() {
  const [lottoData, setLottoData] = useState<LottoWeek | null>(null);
  const [previousWeekWinningNumbers, setPreviousWeekWinningNumbers] = useState<{ numbers: number[]; bonus: number; } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeek] = useState(getWeekString(new Date()));
  const [previousDrawNo] = useState(getLatestDrawNo(new Date()));

  useEffect(() => {
    const fetchAllLottoData = async () => {
      setIsLoading(true);
      try {
        const [currentRes, pastWinsRes] = await Promise.all([
          fetch(`/api/lotto/${currentWeek}`),
          /* [수정] 지난주 번호 조회를 위해 past-wins API를 호출합니다. */
          fetch(`/api/lotto/past-wins`) 
        ]);

        if (currentRes.ok) {
          setLottoData(await currentRes.json());
        } else {
          setLottoData(null);
        }

        if (pastWinsRes.ok) {
          const allPastWins = await pastWinsRes.json();
          /* 조회된 전체 과거 데이터에서 지난주 회차에 해당하는 번호를 찾아 설정합니다. */
          if (allPastWins[previousDrawNo]) {
            setPreviousWeekWinningNumbers(allPastWins[previousDrawNo]);
          }
        } else {
          setPreviousWeekWinningNumbers(null);
        }

      } catch (error) {
        console.error("Failed to fetch lotto data", error);
        setLottoData(null);
        setPreviousWeekWinningNumbers(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllLottoData();
  }, [currentWeek, previousDrawNo]);

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <div className="w-full max-w-2xl">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4 text-center flex items-center justify-center gap-3">
    <Ticket className="h-8 w-8 text-blue-500" />
    <span>이번 주 로또 번호</span>
    </h1>
    <LottoMethodology />
    {isLoading ? (
      <p className="text-center text-slate-500">이번 주 로또 번호를 불러오는 중입니다...</p>
    ) : lottoData ? (
    <Accordion type="single" collapsible defaultValue={currentWeek} className="w-full space-y-4">
    <LottoWeekCard
    weekData={lottoData}
    previousWeekWinningNumbers={previousWeekWinningNumbers}
    />
    </Accordion>
    ) : (
    <div className="text-center p-8 border-2 border-dashed rounded-lg border-slate-300 dark:border-slate-700">
    <p className="mb-4 text-slate-500">
    아직 이번 주 번호가 생성되지 않았습니다.
      <br />
    번호는 매주 월요일 오전 9시에 자동으로 생성됩니다.
      </p>
    </div>
    )}
    </div>
    </div>
  );
}
