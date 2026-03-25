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

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

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

  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tfParam = urlParams.get("tf");
      if (tfParam === "1h" || tfParam === "15m" || tfParam === "1d") {
        return tfParam as Timeframe;
      }
    }
    return "1d";
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const [timeUntilNextSync, setTimeUntilNextSync] = useState<number>(
    AUTO_REFRESH_INTERVAL_MS,
  );

  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const adviceTriggered = useRef(false);
  const previousTimeframe = useRef<Timeframe>(selectedTimeframe);
  const nextSyncTimeRef = useRef<number | null>(null);

  // [FIXED] Removed tickerStates from dependency by using functional update internally
  const fetchStockData = useCallback(
    async (
      ticker: string,
      timeframe: Timeframe,
      forceRefresh: boolean = false,
    ) => {
      setTickerStates((prev) => {
        // Prevent unnecessary state updates if already loading
        if (prev[ticker]?.loading === true && !forceRefresh) return prev;
        return {
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        };
      });

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

  const loadAllTickersSequentially = useCallback(
    async (
      timeframeToLoad: Timeframe,
      forceRefresh: boolean = false,
      isTimeframeChange: boolean = false,
      isAutoRefresh: boolean = false,
    ) => {
      if (tickers.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const focusTicker = urlParams.get("ticker");

        let initialTicker = tickers[0];

        if (isTimeframeChange && openedTicker) {
          initialTicker = openedTicker;
        } else if (focusTicker && tickers.includes(focusTicker)) {
          initialTicker = focusTicker;
        }

        if (
          !fullLoadInitiated.current ||
          (!isTimeframeChange && !forceRefresh && !isAutoRefresh)
        ) {
          setOpenedTicker(initialTicker);
        }

        await fetchStockData(initialTicker, timeframeToLoad, forceRefresh);

        for (let i = 0; i < tickers.length; i++) {
          const ticker = tickers[i];
          if (ticker === initialTicker) continue;

          await new Promise((resolve) => setTimeout(resolve, 500));
          await fetchStockData(ticker, timeframeToLoad, forceRefresh);
        }

        setLastSyncTime(new Date());
        nextSyncTimeRef.current = Date.now() + AUTO_REFRESH_INTERVAL_MS;
        setTimeUntilNextSync(AUTO_REFRESH_INTERVAL_MS);
      }
    },
    [fetchStockData, openedTicker],
  );

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    console.log("[MANUAL SYNC] Starting forced refresh for all tickers");
    await loadAllTickersSequentially(selectedTimeframe, true, false, false);
    setIsSyncing(false);
  };

  useEffect(() => {
    if (!fullLoadInitiated.current) {
      fullLoadInitiated.current = true;
      loadAllTickersSequentially(selectedTimeframe);
      return;
    }

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

      loadAllTickersSequentially(selectedTimeframe, false, true, false);
    }
  }, [loadAllTickersSequentially, selectedTimeframe]);

  useEffect(() => {
    const unifiedSyncTimer = setInterval(() => {
      if (nextSyncTimeRef.current) {
        const remainingTime = nextSyncTimeRef.current - Date.now();

        if (remainingTime <= 0) {
          console.log(
            "[AUTO SYNC] Countdown reached 0. Initiating background data refresh...",
          );
          nextSyncTimeRef.current = Date.now() + AUTO_REFRESH_INTERVAL_MS;
          setTimeUntilNextSync(AUTO_REFRESH_INTERVAL_MS);
          loadAllTickersSequentially(selectedTimeframe, true, false, true);
        } else {
          setTimeUntilNextSync(remainingTime);
        }
      }
    }, 1000);

    return () => clearInterval(unifiedSyncTimer);
  }, [loadAllTickersSequentially, selectedTimeframe]);

  const handleOpenChange = (ticker: string) => {
    const newOpenedTicker = openedTicker === ticker ? null : ticker;
    setOpenedTicker(newOpenedTicker);
  };

  const getSyncButtonText = () => {
    if (isSyncing) return "동기화 중...";

    const minutes = Math.floor(timeUntilNextSync / 60000);
    const seconds = Math.floor((timeUntilNextSync % 60000) / 1000);
    const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    if (lastSyncTime) {
      const syncHours = lastSyncTime.getHours().toString().padStart(2, "0");
      const syncMinutes = lastSyncTime.getMinutes().toString().padStart(2, "0");

      return (
        <span className="flex items-center gap-1">
          <span className="hidden sm:inline text-xs opacity-75">
            {syncHours}:{syncMinutes} 완료
          </span>
          <span className="hidden sm:inline opacity-50">|</span>
          <span>{formattedCountdown} 후 갱신</span>
        </span>
      );
    }

    return `${formattedCountdown} 후 갱신`;
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
            className={`flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-medium transition-all w-full md:w-auto min-w-[160px]
                  ${
                    isSyncing
                      ? "bg-blue-100 text-blue-400 cursor-not-allowed dark:bg-blue-900/30 dark:text-blue-500"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95"
                  }`}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 shrink-0 ${isSyncing ? "animate-spin" : ""}`}
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
