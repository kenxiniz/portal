/* app/lotto/page.tsx */

'use client';

import { useState, useEffect } from 'react';
import { LottoWeekCard } from '@/components/LottoWeekCard';
import { Accordion } from "@/components/ui/accordion";
import { LottoWeek } from '@/types/lotto';
import { Ticket } from 'lucide-react';
import { LottoMethodology } from '@/components/LottoMethodology';

/* 현재 날짜를 기준으로 'YYYY-WW' 형식의 주차 문자열을 반환합니다. */
const getCurrentWeek = (): string => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime() + (start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  const week = Math.ceil((day + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-${String(week).padStart(2, '0')}`;
};

export default function LottoPage() {
  const [lottoData, setLottoData] = useState<LottoWeek | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeek] = useState(getCurrentWeek());

  const fetchLottoData = async (week: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lotto/${week}`);
      if (res.ok) {
        const data = await res.json();
        setLottoData(data);
      } else {
        setLottoData(null);
      }
    } catch (error) {
      console.error("Failed to fetch lotto data", error);
      setLottoData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLottoData(currentWeek);
  }, [currentWeek]);

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <div className="w-full max-w-2xl">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4 text-center flex items-center justify-center gap-3">
    <Ticket className="h-8 w-8 text-blue-500" />
    <span>이번 주 로또 번호</span>
    </h1>

    {/* [핵심 수정] LottoMethodology 컴포넌트를 조건부 렌더링 블록 밖으로 이동시켜 항상 보이도록 합니다. */}
    <LottoMethodology />

    {/* 아래 부분은 로딩 및 데이터 유무에 따라 조건부로 렌더링됩니다. */}
    {isLoading ? (
      <p className="text-center text-slate-500">이번 주 로또 번호를 불러오는 중입니다...</p>
    ) : lottoData ? (
    <Accordion type="single" collapsible defaultValue={currentWeek} className="w-full space-y-4">
    <LottoWeekCard weekData={lottoData} />
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
