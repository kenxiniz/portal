/* components/StockCollapsibleCard.tsx */

"use client";

import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus, CircleDollarSign } from 'lucide-react';
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
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getSignalIcon = (signal: TradingSignal) => {
  if (signal.type === 'sell') {
    return <CircleDollarSign className="h-4 w-4 text-green-500" />;
  }
  if (signal.type === 'buy') {
    return <TrendingUp className="h-4 w-4 text-blue-500" />;
  }
  if (signal.type === 'inverse-buy') {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-gray-500" />;
};


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
    const { type } = latestSignal;
    if (type.includes('buy')) {
      return 'text-blue-500 dark:text-blue-400';
    }
    /* [수정] 손실일 경우에도 색상이 적용되도록 sell 타입을 확인합니다. */
    if (type === 'sell') {
      return latestSignal.profitRate! >= 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400';
    }
    return "";
  };

  const historicalSignals = tickerState.signals.filter(s => s.type !== 'hold');

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.startDate || signal.date;
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
      {/* [수정] 테이블 헤더를 변경합니다. */ }
      <TableHead className="h-8 text-right">가격/수익률</TableHead>
      </TableRow>
      </TableHeader>
      <TableBody>
      {historicalSignals.map((signal, index) => (
        <TableRow key={index} onClick={() => handleSignalClick(signal)} className="cursor-pointer">
        <TableCell className="font-mono text-xs whitespace-nowrap py-1">
        {signal.startDate ? `${formatDate(signal.startDate)} ~ ${formatDate(signal.date)}` : formatDate(signal.date)}
        </TableCell>
        <TableCell className="text-xs py-1 flex items-center gap-1">
        {getSignalIcon(signal)}
        {signal.reason}
        </TableCell>
        <TableCell className="text-xs py-1 text-right font-mono">
        {signal.type === 'sell' && signal.profitRate !== undefined && (
          <div className="flex flex-col items-end">
          <span className={signal.profitRate >= 0 ? 'text-green-500' : 'text-red-500'}>
          {signal.profitRate.toFixed(2)}%
          </span>
          {/* [추가] BB 밴드 가격을 표시합니다. */}
          <span className="text-gray-500 text-[10px]">{signal.details}</span>
          </div>
        )}
        {signal.type.includes('buy') && signal.entryPrice !== undefined && (
          <span>
          ${signal.entryPrice.toFixed(2)}
          </span>
        )}
        </TableCell>
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
