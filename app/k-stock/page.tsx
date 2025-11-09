/* /app/k-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useThemeDetector } from "@/hooks/useThemeDetector";
import { TickerState, StockDataPoint, TradingSignal } from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";
import { StockCollapsibleCard } from "@/components/StockCollapsibleCard";

const tickers = stockConfig.k_stocks.map((t) => t.ticker);

export default function KStockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(
    () => {
      const initialState: Record<string, TickerState> = {};
      tickers.forEach((ticker) => {
        initialState[ticker] = {
          data: null,
          loading: true,
          error: null,
          signals: [],
        };
      });
      return initialState;
    },
  );

  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);

  const fetchStockData = useCallback(
    async (ticker: string) => {
      if (tickerStates[ticker]?.loading !== true) {
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        }));
      }

      try {
        // MODIFIED: Fetch path uses the user-requested data route
        const response = await fetch(`/api/k-stock/${ticker}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`,
          );
        }

        const {
          data,
          signals,
        }: {
          data: StockDataPoint[];
          signals: TradingSignal[];
        } = await response.json();

        setTickerStates((prev) => ({
          ...prev,
          [ticker]: {
            data: data,
            signals: signals,
            loading: false,
            error: null,
          },
        }));
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "An unknown error occurred";
        console.error(`Failed to fetch data for ${ticker}:`, e);
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: {
            ...prev[ticker],
            loading: false,
            error: `Failed to load data for ${ticker}. Error: ${errorMessage}`,
          },
        }));
      }
    },
    [tickerStates],
  );

  useEffect(() => {
    const loadAllTickersSequentially = async () => {
      if (tickers.length > 0) {
        const firstTicker = tickers[0];
        setOpenedTicker(firstTicker);
        await fetchStockData(firstTicker);

        for (let i = 1; i < tickers.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const ticker = tickers[i];
          await fetchStockData(ticker);
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
        한국 ETF
      </h1>
      <div className="w-full grid grid-cols-1 gap-6">
        {tickers.map((ticker) => {
          const state = tickerStates[ticker];
          if (!state) return null;

          const stockInfo = stockConfig.k_stocks.find(
            (s) => s.ticker === ticker,
          );
          const displayName = stockInfo ? stockInfo.name : ticker;

          return (
            <StockCollapsibleCard
              key={ticker}
              tickerSymbol={ticker}
              displayName={displayName}
              apiType="kStock" // This is used to build the advice path
              tickerState={state}
              gridStrokeColor={gridStrokeColor}
              isOpen={openedTicker === ticker}
              onOpenChange={() => handleOpenChange(ticker)}
              currency="KRW"
            />
          );
        })}
      </div>
    </div>
  );
}
