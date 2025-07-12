/* /app/kis-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useThemeDetector } from '@/hooks/useThemeDetector';
import { TickerState, StockDataPoint, TradingSignal } from '@/lib/stockUtils';
import allTickers from '@/lib/stock.json';
import { StockCollapsibleCard } from '@/components/StockCollapsibleCard';

export default function KisStockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(() => {
    const initialState: Record<string, TickerState> = {};
    allTickers.tickers.forEach(ticker => {
      initialState[ticker] = { data: null, loading: false, error: null, signals: [] };
    });
    return initialState;
  });

  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);

  const fetchStockData = useCallback(async (ticker: string, isInitialLoad: boolean) => {
    if (isInitialLoad) {
      setTickerStates(prev => ({ ...prev, [ticker]: { ...prev[ticker], loading: true, error: null } }));
    }

    try {
      /* 한국투자증권 API 라우트 호출 */
      const response = await fetch(`/api/kisStock/${ticker}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const { data, signals }: { data: StockDataPoint[], signals: TradingSignal[] } = await response.json();

      setTickerStates(prev => ({
        ...prev,
        [ticker]: { data: data, signals: signals, loading: false, error: null }
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

  useEffect(() => {
    const loadAllTickersSequentially = async () => {
      if (allTickers.tickers.length > 0) {
        const firstTicker = allTickers.tickers[0];
        setOpenedTicker(firstTicker);
        await fetchStockData(firstTicker, true);

        for (let i = 1; i < allTickers.tickers.length; i++) {
          const ticker = allTickers.tickers[i];
          await fetchStockData(ticker, false);
        }
      }
    };

    if (!fullLoadInitiated.current) {
      fullLoadInitiated.current = true;
      loadAllTickersSequentially();
    }
  }, [fetchStockData]);

  const handleOpenChange = (ticker: string) => {
    const newOpenedTicker = openedTicker === ticker ? null : ticker;
    setOpenedTicker(newOpenedTicker);
  };

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
    주식 포트폴리오 (한투)
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
