/* components/StockCollapsibleCard.tsx */

"use client";

import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TickerState, TradingSignal } from '@/lib/stockUtils';
import { StockChartDisplay, StockChartDisplayHandles } from './StockChartDisplay';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StockCollapsibleCardProps {
  ticker: string;
  tickerState: TickerState;
  gridStrokeColor: string;
  isOpen: boolean;
  onOpenChange: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' });
}

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  ticker,
  tickerState,
  gridStrokeColor,
  isOpen,
  onOpenChange
}) => {
  const latestSignal = tickerState.signals.length > 0 ? tickerState.signals[tickerState.signals.length - 1] : null;
  const chartRef = useRef<StockChartDisplayHandles>(null);

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

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.startDate || signal.date;
    console.log(`[${ticker}] Row Clicked! Target Date:`, targetDate);
    chartRef.current?.moveToDate(targetDate);
  };

  return (
    <Collapsible
    open={isOpen}
    onOpenChange={onOpenChange}
    className="w-full"
    >
    <Card className="w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg py-0">
    <CollapsibleTrigger asChild>
    <CardHeader className={cn("flex flex-row justify-between items-center cursor-pointer rounded-t-lg transition-colors py-4 px-4")}>
    <CardTitle className={cn("text-xl font-semibold", getCardTitleClassName())}>{ticker}</CardTitle>
    {tickerState.loading && <span className="text-sm">로딩 중...</span>}
    {tickerState.error && <span className="text-sm text-red-500">오류</span>}
    {isOpen ? <ChevronUp className="h-5 w-5 ml-2" /> : <ChevronDown className="h-5 w-5 ml-2" />}
    </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
    <CardContent className="pt-2 p-4">
    {historicalSignals.length > 0 ? (
      <div className="my-2">
      <h4 className="text-sm font-semibold mb-2">과거 신호 내역</h4>
      <Table>
      <TableHeader>
      <TableRow>
      <TableHead className="h-8">기간</TableHead>
      <TableHead className="h-8">신호</TableHead>
      </TableRow>
      </TableHeader>
      <TableBody>
      {historicalSignals.map((signal, index) => (
        <TableRow key={index} onClick={() => handleSignalClick(signal)} className="cursor-pointer">
        <TableCell className="font-mono text-xs whitespace-nowrap py-1">
        {signal.startDate ? `${formatDate(signal.startDate)} ~ ${formatDate(signal.date)}` : formatDate(signal.date)}
        </TableCell>
        <TableCell className="text-xs py-1">{signal.reason}</TableCell>
        </TableRow>
      ))}
      </TableBody>
      </Table>
      </div>
    ) : (
    <p className="text-xs text-center text-gray-500 my-4">지난 1년간 유의미한 매매 신호가 없었습니다.</p>
    )}

    <StockChartDisplay
    ref={chartRef}
    data={tickerState.data}
    signals={tickerState.signals}
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
