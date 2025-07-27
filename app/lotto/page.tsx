/* app/lotto/page.tsx */

'use client';

import { useState, useEffect } from 'react';
import { LottoWeekCard } from '@/components/LottoWeekCard';
import { Accordion } from "@/components/ui/accordion";
import { LottoWeek } from '@/types/lotto';
import { Ticket } from 'lucide-react';
import { LottoMethodology } from '@/components/LottoMethodology';

export interface ExtendedLottoWeek extends LottoWeek {
  previousWeekWinningInfo?: {
    drawNo: number;
    numbers: number[];
    bonus: number;
  } | null;
}

export default function LottoPage() {
  const [lottoData, setLottoData] = useState<ExtendedLottoWeek[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultOpenWeek, setDefaultOpenWeek] = useState<string>('');

  const fetchLottoData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lotto/all`);
      if (res.ok) {
        const data: ExtendedLottoWeek[] = await res.json();
        setLottoData(data);

        if (data && data.length > 0) {
          setDefaultOpenWeek(data[0].week);
        }
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
    fetchLottoData();
  }, []);

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <div className="w-full max-w-2xl">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4 text-center flex items-center justify-center gap-3">
    <Ticket className="h-8 w-8 text-blue-500" />
    <span>로또 번호</span>
    </h1>

    <LottoMethodology />

    {isLoading ? (
      <p className="text-center text-slate-500">로또 번호 데이터를 불러오는 중입니다...</p>
    ) : lottoData && lottoData.length > 0 ? (
    <Accordion type="single" collapsible defaultValue={defaultOpenWeek} className="w-full space-y-4">
    {lottoData.map((weekData) => (
      <LottoWeekCard 
      key={weekData.week} 
      weekData={weekData} 
      />
    ))}
    </Accordion>
    ) : (
    <div className="text-center p-8 border-2 border-dashed rounded-lg border-slate-300 dark:border-slate-700">
    <p className="mb-4 text-slate-500">
    생성된 로또 번호가 없습니다.
      <br />
    새 번호는 매주 토요일 21시 이후 자동으로 생성됩니다.
      </p>
    </div>
    )}
    </div>
    </div>
  );
}
