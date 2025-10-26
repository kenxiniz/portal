/* /app/kis-stock/page.tsx */

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

export default function KisStockPage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(
    () => {
      const initialState: Record<string, TickerState> = {};
      tickers.forEach((ticker) => {
        initialState[ticker] = {
          data: null,
          loading: true, // Start loading initially
          error: null,
          signals: [],
          advice: null, // ✅ Initialize advice state as AdviceObject | null
        };
      });
      return initialState;
    },
  );

  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);

  // Remove isInitialLoad parameter
  const fetchStockData = useCallback(
    async (ticker: string) => {
      // Set loading state only if it's not already loading
      if (tickerStates[ticker]?.loading !== true) {
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        }));
      }

      try {
        const response = await fetch(`/api/kisStock/${ticker}`);
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
          advice, // Destructure advice object
        }: {
          data: StockDataPoint[];
          signals: TradingSignal[];
          advice: AdviceObject | null; // Expect AdviceObject (or null)
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
            ...prev[ticker], // Keep existing data/signals if any
            loading: false,
            error: `Failed to load data for ${ticker}. Error: ${errorMessage}`,
            advice: null, // ✅ Ensure advice is null on error
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
        setOpenedTicker(firstTicker); // Open the first card
        // Remove isInitialLoad argument
        await fetchStockData(firstTicker); // Fetch first

        // Fetch rest with delay
        for (let i = 1; i < tickers.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const ticker = tickers[i];
          // Remove isInitialLoad argument
          await fetchStockData(ticker); // Fetch next
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
    //   fetchStockData(newOpenedTicker);
    // }
  };

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
        한투 주식 (미국)
      </h1>
      <div className="w-full grid grid-cols-1 gap-6">
        {tickers.map((ticker) => {
          const state = tickerStates[ticker];
          // Ensure state exists before rendering card
          if (!state) return null;
          return (
            <StockCollapsibleCard
              key={ticker}
              ticker={ticker} // Use ticker symbol
              tickerState={state} // Pass the whole state including advice object
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
