/* /app/stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useThemeDetector } from "@/hooks/useThemeDetector";
// ✅ Import AdviceObject type
import {
  TickerState,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";
import { StockCollapsibleCard } from "@/components/StockCollapsibleCard";

const tickers = stockConfig.us_stocks.map((t) => t.ticker);

export default function StockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(
    () => {
      const initialState: Record<string, TickerState> = {};
      tickers.forEach((ticker) => {
        // ✅ Initialize with advice: null
        initialState[ticker] = {
          data: null,
          loading: true, // Start loading initially
          error: null,
          signals: [],
          advice: null, // Initialize advice state
        };
      });
      return initialState;
    },
  );

  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);

  // ✅ Remove isInitialLoad parameter
  const fetchStockData = useCallback(
    async (ticker: string /* , isInitialLoad: boolean <- Removed */) => {
      // Set loading state only if not already loading
      if (tickerStates[ticker]?.loading !== true) {
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        }));
      }

      try {
        // Assuming /api/stock/[ticker] endpoint ALSO returns 'advice' object
        const response = await fetch(`/api/stock/${ticker}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`,
          );
        }
        // ✅ Destructure 'advice' as AdviceObject
        const {
          data,
          signals,
          advice, // Assume API provides advice object
        }: {
          data: StockDataPoint[];
          signals: TradingSignal[];
          advice: AdviceObject | null; // Expect AdviceObject from API
        } = await response.json();

        setTickerStates((prev) => ({
          ...prev,
          [ticker]: {
            data: data,
            signals: signals,
            advice: advice, // ✅ Save advice object to state
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
            advice: null, // ✅ Reset advice on error
          },
        }));
      }
    },
    [tickerStates], // Include tickerStates as dependency
  );

  useEffect(() => {
    const loadAllTickersSequentially = async () => {
      if (tickers.length > 0) {
        const firstTicker = tickers[0];
        setOpenedTicker(firstTicker);
        // ✅ Remove isInitialLoad argument
        await fetchStockData(firstTicker /* , true <- Removed */);

        for (let i = 1; i < tickers.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500)); // Keep delay
          const ticker = tickers[i];
          // ✅ Remove isInitialLoad argument
          await fetchStockData(ticker /* , true <- Removed */);
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
    // Optional: Fetch only when opening if not loaded
    // if (newOpenedTicker && !tickerStates[newOpenedTicker]?.data) {
    //   fetchStockData(newOpenedTicker); // Call without isInitialLoad
    // }
  };

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
        미국 주식 (Alpha Vantage)
      </h1>
      <div className="w-full grid grid-cols-1 gap-6">
        {tickers.map((ticker) => {
          const state = tickerStates[ticker];
          // Ensure state exists before rendering card
          if (!state) return null;
          return (
            <StockCollapsibleCard
              key={ticker}
              ticker={ticker}
              tickerState={state} // Pass the state including advice object
              gridStrokeColor={gridStrokeColor}
              isOpen={openedTicker === ticker}
              onOpenChange={() => handleOpenChange(ticker)}
              currency="USD"
            />
          );
        })}
      </div>
    </div>
  );
}
