/* /app/kis-stock/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useThemeDetector } from "@/hooks/useThemeDetector";
import {
  TickerState,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
} from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";
import { StockCollapsibleCard } from "@/components/StockCollapsibleCard";
import NasdaqFuturesChart from "@/components/NasdaqFuturesChart";
import { RefreshCw, Globe, MapPin, Sparkles } from "lucide-react";

const tickers = stockConfig.us_stocks.map((t) => t.ticker);

type Timeframe = "1d" | "1h" | "15m";

function getFrontMonthTicker(baseTicker: string): string {
  const now = new Date();
  let year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  let monthCode = "";

  if (month < 3 || (month === 3 && day < 15)) {
    monthCode = "H";
  } else if (month < 6 || (month === 6 && day < 15)) {
    monthCode = "M";
  } else if (month < 9 || (month === 9 && day < 15)) {
    monthCode = "U";
  } else if (month < 12 || (month === 12 && day < 15)) {
    monthCode = "Z";
  } else {
    monthCode = "H";
    year += 1;
  }

  // Use 2 digits for year to match KIS API specification
  const yearDigit = year.toString().slice(-2);
  return `${baseTicker}${monthCode}${yearDigit}`;
}

export default function KisStockPage() {
  const router = useRouter();

  const [dynamicFuturesTicker] = useState<string>(() =>
    getFrontMonthTicker("NQ"),
  );

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
  const [isAiSyncing, setIsAiSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const previousTimeframe = useRef<Timeframe>("1d");
  const isForceRefreshingRef = useRef(false);

  const fetchStockData = useCallback(
    async (
      ticker: string,
      timeframe: Timeframe,
      forceRefresh: boolean = false,
    ) => {
      const shouldBypassCache = forceRefresh || isForceRefreshingRef.current;

      setTickerStates((prev) => {
        if (prev[ticker]?.loading === true && !shouldBypassCache) return prev;
        return {
          ...prev,
          [ticker]: { ...prev[ticker], loading: true, error: null },
        };
      });

      try {
        console.log(
          `[DATA FETCH] Fetching ${ticker} data for timeframe: ${timeframe}, refresh: ${shouldBypassCache}`,
        );

        const noCacheTimestamp = Date.now();
        const endpoint = `/api/kisStock/${ticker}?timeframe=${timeframe}${shouldBypassCache ? "&refresh=true" : ""}&t=${noCacheTimestamp}`;

        const response = await fetch(endpoint, { cache: "no-store" });

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

        setTickerStates((prev) => {
          const prevState = prev[ticker];
          const hasNewData = Array.isArray(data) && data.length > 0;

          return {
            ...prev,
            [ticker]: {
              data: hasNewData ? data : prevState.data,
              signals: hasNewData ? signals : prevState.signals,
              loading: false,
              error:
                !hasNewData && prevState.data && prevState.data.length > 0
                  ? "API call delayed. Keeping existing chart data."
                  : null,
              advice: advice || prevState.advice || null,
            },
          };
        });
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "An unknown error occurred";
        console.error(`Failed to fetch data for ${ticker}:`, e);
        setTickerStates((prev) => ({
          ...prev,
          [ticker]: {
            ...prev[ticker],
            loading: false,
            error:
              prev[ticker]?.data && prev[ticker].data!.length > 0
                ? `Sync failed: ${errorMessage} (Keeping existing data)`
                : `Failed to load data for ${ticker}. Error: ${errorMessage}`,
          },
        }));
      }
    },
    [],
  );

  // [REMOVED] Advice generation is handled exclusively by the scheduler (daily 09:00 KST).
  // Triggering it on every page load caused unintended Gemini API calls outside schedule.

  const loadAllTickersSequentially = useCallback(
    async (
      timeframeToLoad: Timeframe,
      forceRefresh: boolean = false,
      isTimeframeChange: boolean = false,
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
          (!isTimeframeChange && !forceRefresh)
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
      }
    },
    [fetchStockData, openedTicker],
  );

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    isForceRefreshingRef.current = true;

    console.log("[MANUAL SYNC] Starting forced refresh for all US tickers");
    await loadAllTickersSequentially(selectedTimeframe, true, false);

    isForceRefreshingRef.current = false;
    setIsSyncing(false);
  };

  const handleAiSync = async () => {
    if (isAiSyncing) return;
    setIsAiSyncing(true);
    console.log(
      "[MANUAL AI SYNC] Starting forced AI advice refresh for US-Stock",
    );

    try {
      const response = await fetch("/api/advice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isBatch: true,
          apiType: "kisStock",
          refresh: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const newAdviceData = await response.json();

      setTickerStates((prev) => {
        const newState = { ...prev };
        Object.keys(newAdviceData).forEach((ticker) => {
          if (newState[ticker]) {
            newState[ticker] = {
              ...newState[ticker],
              advice: newAdviceData[ticker],
            };
          }
        });
        return newState;
      });
      console.log("[MANUAL AI SYNC] AI advice refresh completed successfully.");
    } catch (error) {
      console.error("[ERROR] Failed to force refresh AI advice:", error);
    } finally {
      setIsAiSyncing(false);
    }
  };

  useEffect(() => {
    if (!fullLoadInitiated.current) {
      fullLoadInitiated.current = true;

      let initialTf: Timeframe = "1d";
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const tfParam = urlParams.get("tf");
        if (tfParam === "1h" || tfParam === "15m" || tfParam === "1d") {
          initialTf = tfParam as Timeframe;
        }
      }

      setSelectedTimeframe(initialTf);
      previousTimeframe.current = initialTf;

      loadAllTickersSequentially(initialTf);
      return;
    }

    if (previousTimeframe.current !== selectedTimeframe) {
      console.log(
        `[TIMEFRAME CHANGED] Updating all US tickers to ${selectedTimeframe}`,
      );
      previousTimeframe.current = selectedTimeframe;

      setTickerStates((prev) => {
        const resetState: Record<string, TickerState> = {};
        Object.keys(prev).forEach((key) => {
          resetState[key] = { ...prev[key], loading: true, error: null };
        });
        return resetState;
      });

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("tf", selectedTimeframe);
        window.history.replaceState({}, "", url.toString());
      }

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
      return (
        <span className="flex items-center gap-1">
          <span>주가 갱신</span>
        </span>
      );
    }

    return "갱신";
  };

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center w-full md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px] mb-6 md:mb-8 gap-4 overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2 md:mb-0 whitespace-nowrap">
            미국 주식/ETF
          </h1>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto overflow-hidden">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto justify-center shrink-0">
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
              1시간 봉 (단타)
            </button>
            <button
              onClick={() => setSelectedTimeframe("15m")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTimeframe === "15m"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              15분 봉 (단타)
            </button>
          </div>

          <div
            className="flex flex-row items-center gap-1.5 sm:gap-2 w-full md:w-auto justify-start md:justify-end flex-nowrap overflow-x-auto pb-2 md:pb-0"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style
              dangerouslySetInnerHTML={{
                __html: `div::-webkit-scrollbar { display: none; }`,
              }}
            />

            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg shrink-0">
              <button
                onClick={() => router.push("/kis-stock")}
                className="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-bold transition-colors bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm whitespace-nowrap"
              >
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0" />
                미국
              </button>
              <button
                onClick={() => router.push("/k-stock")}
                className="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0" />
                한국
              </button>
            </div>

            <button
              onClick={handleAiSync}
              disabled={isAiSyncing}
              className={`flex items-center justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all shrink-0 whitespace-nowrap
                  ${
                    isAiSyncing
                      ? "bg-purple-100 text-purple-400 cursor-not-allowed dark:bg-purple-900/30 dark:text-purple-500"
                      : "bg-purple-600 text-white hover:bg-purple-700 shadow-md active:scale-95"
                  }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0 ${isAiSyncing ? "animate-pulse" : ""}`}
              />
              {isAiSyncing ? "AI 갱신 중" : "AI 갱신"}
            </button>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`flex items-center justify-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all shrink-0 whitespace-nowrap min-w-[120px] sm:min-w-[140px]
                  ${
                    isSyncing
                      ? "bg-blue-100 text-blue-400 cursor-not-allowed dark:bg-blue-900/30 dark:text-blue-500"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95"
                  }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0 ${isSyncing ? "animate-spin" : ""}`}
              />
              {getSyncButtonText()}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 gap-4 md:gap-6 md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 w-full">
          <NasdaqFuturesChart ticker={dynamicFuturesTicker} />
        </div>

        {tickers.map((ticker) => {
          const state = tickerStates[ticker];
          if (!state) return null;

          const stockInfo = stockConfig.us_stocks.find(
            (s) => s.ticker === ticker,
          ) as { ticker: string; exchange: string; name?: string } | undefined;

          const displayName = stockInfo?.name || ticker;

          return (
            <StockCollapsibleCard
              key={ticker}
              tickerSymbol={ticker}
              displayName={displayName}
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
