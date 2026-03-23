/* /app/kis-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useThemeDetector } from "@/hooks/useThemeDetector";
import {
  TickerState,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";
import { StockCollapsibleCard } from "@/components/StockCollapsibleCard";
import { RefreshCw } from "lucide-react";

const tickers = stockConfig.us_stocks.map((t) => t.ticker);

type Timeframe = "1d" | "1h" | "15m";

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
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1d");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const adviceTriggered = useRef(false);
  const previousTimeframe = useRef<Timeframe>("1d");

  const fetchStockData = useCallback(
    async (
      ticker: string,
      timeframe: Timeframe,
      forceRefresh: boolean = false,
    ) => {
      if (tickerStates[ticker]?.loading !== true) {
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        }));
      }

      try {
        console.log(
          `[DATA FETCH] Fetching ${ticker} data for timeframe: ${timeframe}, refresh: ${forceRefresh}`,
        );

        const noCacheTimestamp = Date.now();
        const endpoint = `/api/kisStock/${ticker}?timeframe=${timeframe}${forceRefresh ? "&refresh=true" : ""}&t=${noCacheTimestamp}`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`,
          );
        }

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
    [],
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

  // [MODIFIED] logic to handle sequential loading while respecting the current opened ticker
  const loadAllTickersSequentially = useCallback(
    async (
      timeframeToLoad: Timeframe,
      forceRefresh: boolean = false,
      isTimeframeChange: boolean = false,
    ) => {
      if (tickers.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const focusTicker = urlParams.get("ticker");

        // [MODIFIED] Determine which ticker to load first
        // If it's a timeframe change, prioritize the currently opened ticker if it exists
        // Otherwise, prioritize the URL param or the first ticker
        let initialTicker = tickers[0];

        if (isTimeframeChange && openedTicker) {
          initialTicker = openedTicker;
        } else if (focusTicker && tickers.includes(focusTicker)) {
          initialTicker = focusTicker;
        }

        // Only set the opened ticker if it's the very first initial load or focused by URL
        if (
          !fullLoadInitiated.current ||
          (!isTimeframeChange && !forceRefresh)
        ) {
          setOpenedTicker(initialTicker);
        }

        // Load the prioritized ticker first
        await fetchStockData(initialTicker, timeframeToLoad, forceRefresh);

        // Load the remaining tickers sequentially
        for (let i = 0; i < tickers.length; i++) {
          const ticker = tickers[i];
          if (ticker === initialTicker) continue;

          await new Promise((resolve) => setTimeout(resolve, 500));
          await fetchStockData(ticker, timeframeToLoad, forceRefresh);
        }

        setLastSyncTime(new Date());
      }
    },
    [fetchStockData, openedTicker],
  );

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    console.log("[MANUAL SYNC] Starting forced refresh for all tickers");
    await loadAllTickersSequentially(selectedTimeframe, true, false);
    setIsSyncing(false);
  };

  useEffect(() => {
    // 1. Initial full load on page mount
    if (!fullLoadInitiated.current) {
      fullLoadInitiated.current = true;
      loadAllTickersSequentially(selectedTimeframe);
      return;
    }

    // 2. Handle timeframe changes without closing the currently opened card
    if (previousTimeframe.current !== selectedTimeframe) {
      console.log(
        `[TIMEFRAME CHANGED] Updating all tickers to ${selectedTimeframe}`,
      );
      previousTimeframe.current = selectedTimeframe;

      setTickerStates((prev) => {
        const resetState: Record<string, TickerState> = {};
        Object.keys(prev).forEach((key) => {
          resetState[key] = { ...prev[key], loading: true, error: null };
        });
        return resetState;
      });

      // Pass true to isTimeframeChange to keep openedTicker intact
      loadAllTickersSequentially(selectedTimeframe, false, true);
    }
  }, [loadAllTickersSequentially, selectedTimeframe]);

  const handleOpenChange = (ticker: string) => {
    const newOpenedTicker = openedTicker === ticker ? null : ticker;
    setOpenedTicker(newOpenedTicker);
  };

  const getSyncButtonText = () => {
    if (isSyncing) return "동기화 중...";
    if (lastSyncTime) {
      const hours = lastSyncTime.getHours().toString().padStart(2, "0");
      const minutes = lastSyncTime.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes} 동기화 완료`;
    }
    return "최신 시세 동기화";
  };

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center w-full md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px] mb-6 md:mb-8 gap-4">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2 md:mb-0">
          미국 주식
        </h1>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto justify-center">
            <button
              onClick={() => setSelectedTimeframe("1d")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTimeframe === "1d"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              일봉
            </button>
            <button
              onClick={() => setSelectedTimeframe("1h")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTimeframe === "1h"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              1시간 봉
            </button>
            <button
              onClick={() => setSelectedTimeframe("15m")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTimeframe === "15m"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              15분 봉
            </button>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className={`flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-medium transition-all w-full md:w-auto
                  ${
                    isSyncing
                      ? "bg-blue-100 text-blue-400 cursor-not-allowed dark:bg-blue-900/30 dark:text-blue-500"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95"
                  }`}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
            />
            {getSyncButtonText()}
          </button>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 gap-4 md:gap-6 md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
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
              timeframe={selectedTimeframe}
            />
          );
        })}
      </div>
    </div>
  );
}
