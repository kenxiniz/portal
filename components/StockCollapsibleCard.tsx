/* components/StockCollapsibleCard.tsx */

"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TickerState } from '@/lib/stockUtils';
import { StockChartDisplay } from './StockChartDisplay';

interface StockCollapsibleCardProps {
  ticker: string;
  tickerState: TickerState;
  gridStrokeColor: string;
  isOpen: boolean;
  /* onOpenChange prop의 타입을 boolean 인자 없이 받도록 수정 */
  onOpenChange: () => void;
}

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  ticker,
  tickerState,
  gridStrokeColor,
  isOpen,
  onOpenChange
}) => {
  return (
    <Collapsible
    open={isOpen}
    onOpenChange={onOpenChange} /* boolean 인자를 전달하지 않고 바로 호출 */
    className="w-full"
    >
    <Card className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg">
    <CollapsibleTrigger asChild>
    <CardHeader className="flex flex-row justify-between items-center cursor-pointer p-4">
    <CardTitle className="text-xl font-semibold">{ticker}</CardTitle>
    {tickerState.loading && <span className="text-blue-500 text-sm">로딩 중...</span>}
    {tickerState.error && <span className="text-red-500 text-sm">오류 발생!</span>}
    {isOpen ? <ChevronUp className="h-5 w-5 ml-2" /> : <ChevronDown className="h-5 w-5 ml-2" />}
    </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
    <CardContent className="pt-0 p-4">
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
