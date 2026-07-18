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
import { StockLayout } from "@/components/StockLayout";
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

  const [selectedSymbol, setSelectedSymbol] = useState<string>(symbols[0]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1d");

  const gridStrokeColor = useThemeDetector();
  const fullLoadInitiated = useRef(false);
  const previousTimeframe = useRef<Timeframe>("1d");
  const wsClientRef = useRef<BinanceWebSocketClient | null>(null);

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
          // 502/500 errors return HTML, not JSON
          const contentType = response.headers.get("content-type");
          let errorMsg = `HTTP ${response.status}`;

          if (contentType?.includes("application/json")) {
            try {
              const errorData = await response.json();
              errorMsg = errorData.error || errorMsg;
            } catch {
              errorMsg = `Server error ${response.status}`;
            }
          } else {
            errorMsg = `Server error ${response.status} (API unavailable)`;
          }

          throw new Error(errorMsg);
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

        if (isTimeframeChange && selectedSymbol) {
          initialSymbol = selectedSymbol;
        } else if (focusSymbol && symbols.includes(focusSymbol)) {
          initialSymbol = focusSymbol;
        }

        if (
          !fullLoadInitiated.current ||
          (!isTimeframeChange && !forceRefresh)
        ) {
          setSelectedSymbol(initialSymbol);
        }

        await fetchSymbolData(initialSymbol, timeframeToLoad, forceRefresh);

        for (let i = 0; i < symbols.length; i++) {
          const symbol = symbols[i];
          if (symbol === initialSymbol) continue;

          await new Promise((resolve) => setTimeout(resolve, 300));
          await fetchSymbolData(symbol, timeframeToLoad, forceRefresh);
        }
      }
    },
    [fetchSymbolData, selectedSymbol],
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
        // DEBUG: Check original RSI before any processing
        const debugCandle = currentState?.data?.find(
          (c) => c.date === "2026-07-15 16:00:00",
        );
        if (debugCandle) {
          console.log(
            "[DEBUG ORIG RSI] Before processing: " +
              debugCandle.rsi?.toFixed(2),
          );
        }
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
        console.log(
          `[WebSocket] Date match: ${lastCandle?.date === formattedDate}`,
        );
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

        // RSI와 볼린저 밴드: 기존값 유지, 마지막만 재계산
        // 전체 재계산하면 신호(REST API RSI)와 화면 RSI 불일치
        const recalcWithIndicators = calculateBollingerBands(
          calculateRSI(updatedData),
        );
        // date 기준으로 원본 RSI 찾기 (인덱스 밀림 방지)
        const origDataMap = new Map(
          (currentState.data || []).map((c) => [c.date, c]),
        );
        const dataWithIndicators = updatedData.map((d, i) => {
          const orig = origDataMap.get(d.date);
          if (i < updatedData.length - 1 && orig) {
            return { ...d, rsi: orig.rsi, bollingerBands: orig.bollingerBands };
          }
          return recalcWithIndicators[i];
        });
        // OLD:

        // DEBUG: RSI 유지 확인
        const testDate = "2026-07-15 16:00:00";
        const testCandle = dataWithIndicators.find((c) => c.date === testDate);
        if (testCandle) {
          console.log(
            `[DEBUG RSI] ${testDate} RSI after update: ${testCandle.rsi?.toFixed(2)}`,
          );
        }
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

      // 기존 연결 정리
      if (wsClientRef.current) {
        console.log(`[WebSocket] Disconnecting previous connection...`);
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
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
      wsClientRef.current = ws;
      console.log(`[WebSocket] Connection stored in ref for ${symbol}`);
    },
    [selectedTimeframe, handleWebSocketUpdate],
  );

  const disconnectWebSocket = useCallback(() => {
    if (wsClientRef.current) {
      console.log(`[WebSocket] Disconnecting...`);
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
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

  // 선택된 종목 변경 시 WebSocket 재연결
  useEffect(() => {
    console.log(`[WebSocket] Selected symbol changed to: ${selectedSymbol}`);

    // WebSocket 연결
    connectWebSocket(selectedSymbol);

    return () => {
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedTimeframe]);

  // 컴포넌트 언마운트 시 WebSocket 정리
  useEffect(() => {
    return () => {
      console.log("[WebSocket] Component unmounting, cleaning up...");
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  // 종목 선택 핸들러
  const handleSelectSymbol = (symbol: string) => {
    console.log(`[UI] User selected symbol: ${symbol}`);
    setSelectedSymbol(symbol);
  };

  // 레이아웃에 전달할 종목 목록 생성
  const symbolItems = symbols.map((symbol) => {
    const symbolInfo = stockConfig.binance_futures.find(
      (s) => s.symbol === symbol,
    ) as { symbol: string; name: string } | undefined;
    return {
      id: symbol,
      name: symbolInfo?.name || symbol,
    };
  });

  return (
    <StockLayout
      title="바이낸스 선물"
      apiType="binance"
      symbols={symbolItems}
      selectedSymbol={selectedSymbol}
      tickerStates={tickerStates}
      onSelectSymbol={handleSelectSymbol}
      timeframe={selectedTimeframe}
      onTimeframeChange={setSelectedTimeframe}
      gridStrokeColor={gridStrokeColor}
      currency="USDT"
    />
  );
}
