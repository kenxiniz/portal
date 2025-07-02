/* app/stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useThemeDetector } from '@/hooks/useThemeDetector';
import { TickerState, calculateRSI, StockDataPoint } from '@/lib/stockUtils';
import allTickers from '@/lib/stock.json';
import { StockCollapsibleCard } from '@/components/StockCollapsibleCard';

export default function StockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(() => {
    const initialState: Record<string, TickerState> = {};
    allTickers.tickers.forEach(ticker => {
      initialState[ticker] = { data: null, loading: false, error: null };
    });
    return initialState;
  });

  /* 현재 열려 있는 카드의 티커를 저장하는 상태 */
  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();

  /* 주식 데이터를 가져오는 함수 */
  const fetchStockData = useCallback(async (ticker: string) => {
    setTickerStates(prev => ({ ...prev, [ticker]: { ...prev[ticker], loading: true, error: null } }));

    try {
      const response = await fetch(`/api/stock/${ticker}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: StockDataPoint[] = await response.json();

      const dataWithRSI = calculateRSI(data);

      setTickerStates(prev => ({
        ...prev,
        [ticker]: { data: dataWithRSI, loading: false, error: null }
      }));
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      console.error(`Failed to fetch data for ${ticker}:`, e);
      setTickerStates(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], loading: false, error: `Failed to load data for ${ticker}. Error: ${errorMessage}` }
      }));
    }
  }, []);

  /*
   *     - 페이지가 처음 로드될 때 이 useEffect가 실행됩니다.
   *         - 첫 번째 티커(allTickers.tickers[0])를 가져와 openedTicker 상태로 설정하여
   *             - 첫 번째 카드가 항상 열려 있도록 합니다.
   *               */
  useEffect(() => {
      if (allTickers.tickers.length > 0) {
      const firstTicker = allTickers.tickers[0];
      setOpenedTicker(firstTicker);
      fetchStockData(firstTicker);
      }
      }, [fetchStockData]);

  /* 사용자가 카드를 클릭할 때 호출되는 핸들러 */
  const handleOpenChange = (ticker: string) => {
    const isCurrentlyOpen = openedTicker === ticker;
    /* 현재 열린 카드를 다시 클릭하면 닫고, 다른 카드를 클릭하면 그 카드를 엽니다. */
    const newOpenedTicker = isCurrentlyOpen ? null : ticker;
    setOpenedTicker(newOpenedTicker);

    /* 새 카드를 여는 경우, 아직 데이터가 없다면 데이터를 가져옵니다. */
    if (!isCurrentlyOpen && newOpenedTicker) {
      const tickerState = tickerStates[newOpenedTicker];
      if (!tickerState.data && !tickerState.loading) {
        fetchStockData(newOpenedTicker);
      }
    }
  };

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
    주식 포트폴리오
    </h1>

    <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {allTickers.tickers.map((ticker) => {
      const state = tickerStates[ticker];
      return (
        <StockCollapsibleCard
        key={ticker}
        ticker={ticker}
        tickerState={state}
        gridStrokeColor={gridStrokeColor}
        isOpen={openedTicker === ticker}
        onOpenChange={() => handleOpenChange(ticker)}
        />
      );
    })}
    </div>
    </div>
  );
}
