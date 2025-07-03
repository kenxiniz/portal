/* components/StockCollapsibleCard.tsx */

"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TickerState } from '@/lib/stockUtils';
import { StockChartDisplay } from './StockChartDisplay';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StockCollapsibleCardProps {
  ticker: string;
  tickerState: TickerState;
  gridStrokeColor: string;
  isOpen: boolean;
  onOpenChange: () => void;
}

/*
 *  * [수정] 날짜 포맷팅 함수가 숫자 타임스탬프를 받아
 *   * 한국식 날짜('YY. M. D.')로 변환하도록 수정합니다.
 *   */
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
}

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  ticker,
  tickerState,
  gridStrokeColor,
  isOpen,
  onOpenChange
}) => {
  const latestSignal = tickerState.signals.length > 0 ? tickerState.signals[tickerState.signals.length - 1] : null;

  const getCardTitleClassName = () => {
    if (!latestSignal) return "";
    const { type, reason } = latestSignal;
    if (type === 'buy' || type === 'inverse-buy' || (type === 'hold' && (reason.includes('매수') || reason.includes('쌍바닥')))) {
      return 'text-blue-500 dark:text-blue-400';
    }
    if (type === 'sell') {
      return 'text-red-500 dark:text-red-400';
    }
    return "";
  };

  const historicalSignals = tickerState.signals.filter(s => s.type !== 'hold');

  return (
    <Collapsible
    open={isOpen}
    onOpenChange={onOpenChange}
    className="w-full"
    >
    <Card className="w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg">
    <CollapsibleTrigger asChild>
    <CardHeader className={cn("flex flex-row justify-between items-center cursor-pointer rounded-t-lg transition-colors py-2 px-4")}>
    <CardTitle className={cn("text-xl font-semibold", getCardTitleClassName())}>{ticker}</CardTitle>
    {tickerState.loading && <span className="text-sm">로딩 중...</span>}
    {tickerState.error && <span className="text-red-500 text-sm">오류 발생!</span>}
    {isOpen ? <ChevronUp className="h-5 w-5 ml-2" /> : <ChevronDown className="h-5 w-5 ml-2" />}
    </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
    <CardContent className="pt-0 p-4">
    {historicalSignals.length > 0 ? (
      <div className="my-4">
      <h4 className="text-sm font-semibold mb-2">과거 신호 내역</h4>
      <Table>
      <TableHeader>
      <TableRow>
      <TableHead>기간</TableHead>
      <TableHead>신호</TableHead>
      </TableRow>
      </TableHeader>
      <TableBody>
      {historicalSignals.map((signal, index) => (
        <TableRow key={index}>
        <TableCell className="font-mono text-xs whitespace-nowrap">
        {signal.startDate ? `${formatDate(signal.startDate)} ~ ${formatDate(signal.date)}` : formatDate(signal.date)}
        </TableCell>
        <TableCell className="text-xs">{signal.reason}</TableCell>
        </TableRow>
      ))}
      </TableBody>
      </Table>
      </div>
    ) : (
    <p className="text-xs text-center text-gray-500 my-4">지난 1년간 유의미한 매매 신호가 없었습니다.</p>
    )}

    <StockChartDisplay
    data={tickerState.data || []}
    gridStrokeColor={gridStrokeColor}
    loading={tickerState.loading}
    error={tickerState.error}
    />
    </CardContent>
    </CollapsibleContent>
    </Card>
    </Collapsible>
  );
};
