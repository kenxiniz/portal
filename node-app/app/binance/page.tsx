/* /app/binance/page.tsx */

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useThemeDetector } from "@/hooks/useThemeDetector";
import {
  TickerState,
  StockDataPoint,
  TradingSignal,
  AdviceObject,
  calculateRSI,
  calculateBollingerBands,
} from "@/lib/stockUtils";
import stockConfig from "@/lib/stock.json";
import { StockCollapsibleCard } from "@/components/StockCollapsibleCard";
import {
  createBinanceWebSocket,
  BinanceWebSocketClient,
  BinanceKlineData,
} from "@/lib/binanceWebSocket";

const symbols = stockConfig.binance_futures.map((t) => t.symbol);

type Timeframe = "1d" | "1h" | "15m";

export default function BinancePage() {
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(
    () => {
      const initialState: Record<string, TickerState> = {};
      symbols.forEach((symbol) => {
        initialState[symbol] = {
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

  // 바이낸스는 항상 실시간만 지원

  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const previousTimeframe = useRef<Timeframe>("1d");
  const wsClientsRef = useRef<Map<string, BinanceWebSocketClient>>(new Map());

  const fetchSymbolData = useCallback(
    async (
      symbol: string,
      timeframe: Timeframe,
      forceRefresh: boolean = false,
    ) => {
      const shouldBypassCache = forceRefresh;

      setTickerStates((prev) => {
        if (prev[symbol]?.loading === true && !shouldBypassCache) return prev;
        return {
          ...prev,
          [symbol]: { ...prev[symbol], loading: true, error: null },
        };
      });

      try {
        console.log(
          `[DATA FETCH] Fetching ${symbol} data for timeframe: ${timeframe}, refresh: ${shouldBypassCache}`,
        );

        const noCacheTimestamp = Date.now();
        const endpoint = `/api/binance/${symbol}?timeframe=${timeframe}${shouldBypassCache ? "&refresh=true" : ""}&t=${noCacheTimestamp}`;

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
          const prevState = prev[symbol];
          const hasNewData = Array.isArray(data) && data.length > 0;

          return {
            ...prev,
            [symbol]: {
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
        console.error(`Failed to fetch data for ${symbol}:`, e);
        setTickerStates((prev) => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            loading: false,
            error:
              prev[symbol]?.data && prev[symbol].data!.length > 0
                ? `Sync failed: ${errorMessage} (Keeping existing data)`
                : `Failed to load data for ${symbol}. Error: ${errorMessage}`,
          },
        }));
      }
    },
    [],
  );

  const loadAllSymbolsSequentially = useCallback(
    async (
      timeframeToLoad: Timeframe,
      forceRefresh: boolean = false,
      isTimeframeChange: boolean = false,
    ) => {
      if (symbols.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const focusSymbol = urlParams.get("symbol");

        let initialSymbol = symbols[0];

        if (isTimeframeChange && openedTicker) {
          initialSymbol = openedTicker;
        } else if (focusSymbol && symbols.includes(focusSymbol)) {
          initialSymbol = focusSymbol;
        }

        if (
          !fullLoadInitiated.current ||
          (!isTimeframeChange && !forceRefresh)
        ) {
          setOpenedTicker(initialSymbol);
        }

        await fetchSymbolData(initialSymbol, timeframeToLoad, forceRefresh);

        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];
          if (symbol === initialSymbol) continue;

          await new Promise((resolve) => setTimeout(resolve, 300));
          await fetchSymbolData(symbol, timeframeToLoad, forceRefresh);
        }

        setLastSyncTime(new Date());
      }
    },
    [fetchSymbolData, openedTicker],
  );


  // WebSocket 실시간 데이터 업데이트
  const handleWebSocketUpdate = useCallback(
    (symbol: string, klineData: BinanceKlineData) => {
      console.log(`[WebSocket] Received data for ${symbol}:`, {
        time: new Date(klineData.time).toISOString(),
        close: klineData.close,
        volume: klineData.volume,
      });

      setTickerStates((prev) => {
        const currentState = prev[symbol];
        if (!currentState?.data || currentState.data.length === 0) {
          console.log(
            `[WebSocket] No data available for ${symbol}, skipping update`,
          );
          return prev;
        }

        const updatedData = [...currentState.data];
        const lastCandle = updatedData[updatedData.length - 1];

        // 날짜 형식 변환
        const klineDate = new Date(klineData.time);
        const formattedDate =
          selectedTimeframe === "1d"
            ? klineDate.toISOString().split("T")[0]
            : klineDate
                .toISOString()
                .replace("Z", "")
                .replace("T", " ")
                .substring(0, 19);

        console.log(
          `[WebSocket] Last candle date: "${lastCandle?.date}", New data date: "${formattedDate}"`,
        );
        console.log(`[WebSocket] Date match: ${lastCandle?.date === formattedDate}`);
        console.log(`[WebSocket] Timeframe: ${selectedTimeframe}`);

        // 마지막 캔들 업데이트 또는 새 캔들 추가
        if (lastCandle && lastCandle.date === formattedDate) {
          console.log(`[WebSocket] Updating existing candle for ${symbol}`);
          updatedData[updatedData.length - 1] = {
            ...lastCandle,
            high: Math.max(lastCandle.high, klineData.high),
            low: Math.min(lastCandle.low, klineData.low),
            close: klineData.close,
            volume: klineData.volume,
          };
        } else {
          console.log(`[WebSocket] Adding new candle for ${symbol}`);
          updatedData.push({
            date: formattedDate,
            open: klineData.open,
            high: klineData.high,
            low: klineData.low,
            close: klineData.close,
            volume: klineData.volume,
          });
        }

        // RSI와 볼린저 밴드 재계산
        const dataWithIndicators = calculateBollingerBands(calculateRSI(updatedData));

        console.log(
          `[WebSocket] Chart updated for ${symbol}, total candles: ${dataWithIndicators.length}`,
        );

        return {
          ...prev,
          [symbol]: {
            ...currentState,
            data: dataWithIndicators,
          },
        };
      });
    },
    [selectedTimeframe],
  );

  // WebSocket 연결/해제
  const connectWebSocket = useCallback(
    (symbol: string) => {
      console.log(`[WebSocket] connectWebSocket called for ${symbol}`);
      console.log(`[WebSocket] isRealTimeEnabled: ${isRealTimeEnabled}`);
      console.log(
        `[WebSocket] Already has connection: ${wsClientsRef.current.has(symbol)}`,
      );

      if (wsClientsRef.current.has(symbol)) {
        console.log(`[WebSocket] ${symbol} already connected, skipping`);
        return;
      }

      console.log(`[WebSocket] Connecting to ${symbol}...`);

      const ws = createBinanceWebSocket(
        symbol,
        selectedTimeframe,
        (klineData: BinanceKlineData) => {
          handleWebSocketUpdate(symbol, klineData);
        },
        (error) => {
          console.error(`[WebSocket] Error for ${symbol}:`, error);
        },
      );

      console.log(`[WebSocket] Starting connection for ${symbol}...`);
      ws.connect();
      wsClientsRef.current.set(symbol, ws);
      console.log(`[WebSocket] Connection stored in ref for ${symbol}`);
    },
    [selectedTimeframe, handleWebSocketUpdate],
  );

  const disconnectWebSocket = useCallback((symbol: string) => {
    const ws = wsClientsRef.current.get(symbol);
    if (ws) {
      console.log(`[WebSocket] Disconnecting ${symbol}...`);
      ws.disconnect();
      wsClientsRef.current.delete(symbol);
    }
  }, []);

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

      loadAllSymbolsSequentially(initialTf);
      return;
    }

    if (previousTimeframe.current !== selectedTimeframe) {
      console.log(
        `[TIMEFRAME CHANGED] Updating all Binance symbols to ${selectedTimeframe}`,
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

      loadAllSymbolsSequentially(selectedTimeframe, false, true);
    }
  }, [loadAllSymbolsSequentially, selectedTimeframe]);

  const handleOpenChange = (symbol: string) => {
    const newOpenedTicker = openedTicker === symbol ? null : symbol;
    console.log(
      `[WebSocket] handleOpenChange - symbol: ${symbol}, newOpenedTicker: ${newOpenedTicker}`,
    );
    setOpenedTicker(newOpenedTicker);

    // 바이낸스는 항상 실시간 연결
    if (newOpenedTicker === symbol) {
      console.log(`[WebSocket] Opening chart with real-time`);
      connectWebSocket(symbol);
    } else if (newOpenedTicker === null) {
      console.log(`[WebSocket] Closing chart`);
      disconnectWebSocket(symbol);
    }
  };

  // 컴포넌트 언마운트 시 모든 WebSocket 정리
  useEffect(() => {
    return () => {
      console.log("[WebSocket] Component unmounting, cleaning up...");
      const clients = wsClientsRef.current;
      clients.forEach((ws) => ws.disconnect());
      clients.clear();
    };
  }, []);

  // timeframe 변경 시에만 WebSocket 재연결
  const prevTimeframeRef = useRef<Timeframe>(selectedTimeframe);
  useEffect(() => {
    // timeframe이 실제로 변경되었을 때만 재연결
    if (prevTimeframeRef.current !== selectedTimeframe) {
      console.log(
        `[WebSocket] Timeframe changed from ${prevTimeframeRef.current} to ${selectedTimeframe}`,
      );
      prevTimeframeRef.current = selectedTimeframe;

      // 열려있는 차트가 있고 실시간이 활성화되어 있으면 재연결
      if (openedTicker && isRealTimeEnabled) {
        const currentSymbol = openedTicker;
        console.log(
          `[WebSocket] Reconnecting ${currentSymbol} with new timeframe...`,
        );

        // 기존 연결 끊기
        const ws = wsClientsRef.current.get(currentSymbol);
        if (ws) {
          ws.disconnect();
          wsClientsRef.current.delete(currentSymbol);
        }

        // 새로운 timeframe으로 재연결
        const newWs = createBinanceWebSocket(
          currentSymbol,
          selectedTimeframe,
          (klineData: BinanceKlineData) => {
            handleWebSocketUpdate(currentSymbol, klineData);
          },
          (error) => {
            console.error(`[WebSocket] Error for ${currentSymbol}:`, error);
          },
        );
        newWs.connect();
        wsClientsRef.current.set(currentSymbol, newWs);
      }
    }
  }, [selectedTimeframe, openedTicker, handleWebSocketUpdate]);

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center w-full md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px] mb-6 md:mb-8 gap-4 overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2 md:mb-0 whitespace-nowrap">
            바이낸스 선물
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
        </div>
      </div>

      <div className="w-full grid grid-cols-1 gap-4 md:gap-6 md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-[1600px]">
        {symbols.map((symbol) => {
          const state = tickerStates[symbol];
          if (!state) return null;

          const symbolInfo = stockConfig.binance_futures.find(
            (s) => s.symbol === symbol,
          ) as { symbol: string; name: string } | undefined;

          const displayName = symbolInfo?.name || symbol;

          return (
            <StockCollapsibleCard
              key={symbol}
              tickerSymbol={symbol}
              displayName={displayName}
              apiType="binance"
              tickerState={state}
              gridStrokeColor={gridStrokeColor}
              isOpen={openedTicker === symbol}
              onOpenChange={() => handleOpenChange(symbol)}
              currency="USDT"
              timeframe={selectedTimeframe}
            />
          );
        })}
      </div>
    </div>
  );
}
