/* components/StockCollapsibleCard.tsx */

"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { TickerState } from '@/lib/stockUtils';
import { StockChartDisplay } from './StockChartDisplay';
import { cn } from '@/lib/utils';

interface StockCollapsibleCardProps {
  ticker: string;
  tickerState: TickerState;
  gridStrokeColor: string;
  isOpen: boolean;
  onOpenChange: () => void;
}

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  ticker,
  tickerState,
  gridStrokeColor,
  isOpen,
  onOpenChange
}) => {
  /*
   *    * 오류 수정: 'signal' 대신 'signals' 배열을 사용하고,
   *       * 가장 최근의 신호(배열의 마지막 요소)를 기준으로 색상을 결정합니다.
   *         */
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

  /* 표시할 상세 정보도 가장 최근 신호를 기준으로 합니다. */
  const signalToDisplay = tickerState.signals.length > 0 
    ? tickerState.signals.slice(-1)[0] // 항상 마지막 신호만 표시
    : null;


    return (
      <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="w-full"
      >
      <Card className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg">
      <CollapsibleTrigger asChild>
      <CardHeader className="flex flex-row justify-between items-center cursor-pointer p-4 rounded-t-lg transition-colors">
      <CardTitle className={cn("text-xl font-semibold", getCardTitleClassName())}>{ticker}</CardTitle>
      {tickerState.loading && <span className="text-sm">로딩 중...</span>}
      {tickerState.error && <span className="text-red-500 text-sm">오류 발생!</span>}
      {isOpen ? <ChevronUp className="h-5 w-5 ml-2" /> : <ChevronDown className="h-5 w-5 ml-2" />}
      </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
      <CardContent className="pt-0 p-4">
      {/* 가장 최근 신호에 대한 상세 정보를 표시합니다. */}
      {signalToDisplay && (
        <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg text-sm">
        <div className="flex items-center font-bold text-gray-800 dark:text-gray-300 mb-1">
        <AlertCircle className="h-5 w-5 mr-2" />
        {signalToDisplay.reason}
        </div>
        <p className="text-gray-700 dark:text-gray-400">{signalToDisplay.details}</p>
        </div>
      )}
      <StockChartDisplay
      data={tickerState.data || []}
      /* signals 배열 전체를 차트로 전달하여 모든 마커를 그리도록 합니다. */
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
