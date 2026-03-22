/* /app/kis-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useThemeDetector } from "@/hooks/useThemeDetector";
// [MODIFIED] AdviceObject import 추가
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
          loading: true,
          error: null,
          signals: [],
          advice: null,
        };
      });
      return initialState;
    },
  );

  const [openedTicker, setOpenedTicker] = useState<string | null>(null);
  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const adviceTriggered = useRef(false);

  const fetchStockData = useCallback(
    async (ticker: string) => {
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

        // [MODIFIED] 응답에서 advice 구조 분해 할당 및 타입 명시
        const {
          data,
          signals,
          advice,
        }: {
          data: StockDataPoint[];
          signals: TradingSignal[];
          advice: AdviceObject | null;
        } = await response.json();

        setTickerStates((prev) => ({
          ...prev,
          [ticker]: {
            data: data,
            signals: signals,
            loading: false,
            error: null,
            // [MODIFIED] API에서 받은 advice가 있으면 사용, 없으면 기존 값 유지
            advice: advice || prev[ticker]?.advice || null,
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
    const triggerAdviceGeneration = async () => {
      if (adviceTriggered.current) return;
      adviceTriggered.current = true;

      try {
        console.log("Triggering background advice generation...");
        await fetch("/api/trigger-advice", { method: "POST" });
      } catch (error) {
        console.error("Failed to trigger advice generation:", error);
      }
    };

    triggerAdviceGeneration();
  }, []);

  useEffect(() => {
    const loadAllTickersSequentially = async () => {
      if (tickers.length > 0) {
        // Parse URL search parameters to check for a specific ticker
        const urlParams = new URLSearchParams(window.location.search);
        const focusTicker = urlParams.get("ticker");

        // Determine which ticker to load and expand first
        const initialTicker =
          focusTicker && tickers.includes(focusTicker)
            ? focusTicker
            : tickers[0];

        setOpenedTicker(initialTicker);
        await fetchStockData(initialTicker);

        // Load the remaining tickers sequentially
        for (let i = 0; i < tickers.length; i++) {
          const ticker = tickers[i];

          // Skip the initial ticker since it is already loaded
          if (ticker === initialTicker) continue;

          await new Promise((resolve) => setTimeout(resolve, 500));
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
        미국 주식
      </h1>
      <div className="w-full grid grid-cols-1 gap-6">
        {tickers.map((ticker) => {
          const state = tickerStates[ticker];
          if (!state) return null;
          return (
            <StockCollapsibleCard
              key={ticker}
              tickerSymbol={ticker}
              displayName={ticker}
              apiType="kisStock"
              tickerState={state}
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
