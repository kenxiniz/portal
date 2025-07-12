/* /app/k-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useThemeDetector } from '@/hooks/useThemeDetector';
import { TickerState, StockDataPoint, TradingSignal } from '@/lib/stockUtils';
import stockConfig from '@/lib/stock.json';
import { StockCollapsibleCard } from '@/components/StockCollapsibleCard';

const tickers = stockConfig.k_stocks.map(t => t.ticker);

export default function KStockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(() => {
    const initialState: Record<string, TickerState> = {};
    tickers.forEach(ticker => {
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
      const response = await fetch(`/api/k-stock/${ticker}`);
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
      if (tickers.length > 0) {
        const firstTicker = tickers[0];
        setOpenedTicker(firstTicker);
        await fetchStockData(firstTicker, true);

        for (let i = 1; i < tickers.length; i++) {
          const ticker = tickers[i];
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
    K-주식
    </h1>
    <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {tickers.map((ticker) => {
      const state = tickerStates[ticker];
      const stockInfo = stockConfig.k_stocks.find(s => s.ticker === ticker);
      const displayName = stockInfo ? stockInfo.name : ticker;

      return (
        <StockCollapsibleCard
        key={ticker}
        ticker={displayName}
        tickerState={state}
        gridStrokeColor={gridStrokeColor}
        isOpen={openedTicker === ticker}
        onOpenChange={() => handleOpenChange(ticker)}
        currency="KRW" /* [수정] 통화 속성 전달 */
        />
      );
    })}
    </div>
    </div>
  );
}
