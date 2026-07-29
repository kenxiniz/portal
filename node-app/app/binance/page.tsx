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

// MVVM: UI 갱신 주기 (1초)
const UI_UPDATE_INTERVAL_MS = 1000;

export default function BinancePage() {
  // ===== View State (UI 렌더링용) =====
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

  // ===== Model (데이터 저장용 - 리렌더 안함) =====
  const dataModelRef = useRef<Record<string, StockDataPoint[]>>({});
  const signalsModelRef = useRef<Record<string, TradingSignal[]>>({});
  const adviceModelRef = useRef<Record<string, AdviceObject | null>>({});
  const wsClientRef = useRef<BinanceWebSocketClient | null>(null);
  const uiUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ===== ViewModel: Model → View 동기화 (throttled) =====
  const syncModelToView = useCallback((symbol: string) => {
    const data = dataModelRef.current[symbol];
    const signals = signalsModelRef.current[symbol];
    const advice = adviceModelRef.current[symbol];

    if (!data || data.length === 0) return;

    setTickerStates((prev) => {
      const prevState = prev[symbol];
      // 데이터 변경 없으면 스킵
      if (prevState.data === data) return prev;

      return {
        ...prev,
        [symbol]: {
          data,
          signals: signals || [],
          loading: false,
          error: null,
          advice: advice || null,
        },
      };
    });
  }, []);

  // ===== Model 업데이트 (WebSocket 수신 시) =====
  const updateModel = useCallback(
    (symbol: string, klineData: BinanceKlineData) => {
      const currentData = dataModelRef.current[symbol];
      if (!currentData || currentData.length === 0) return;

      const updatedData = [...currentData];
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

      // 마지막 캔들 업데이트 또는 새 캔들 추가
      if (lastCandle && lastCandle.date === formattedDate) {
        updatedData[updatedData.length - 1] = {
          ...lastCandle,
          high: Math.max(lastCandle.high, klineData.high),
          low: Math.min(lastCandle.low, klineData.low),
          close: klineData.close,
          volume: klineData.volume,
        };
      } else {
        updatedData.push({
          date: formattedDate,
          open: klineData.open,
          high: klineData.high,
          low: klineData.low,
          close: klineData.close,
          volume: klineData.volume,
        });
        // 500개 초과 시 제거
        if (updatedData.length > 500) {
          updatedData.shift();
        }
      }

      // RSI/BB: 기존값 유지, 마지막만 재계산
      const recalcData = calculateBollingerBands(calculateRSI(updatedData));
      const origDataMap = new Map(currentData.map((c) => [c.date, c]));
      const finalData = recalcData.map((d, i) => {
        const orig = origDataMap.get(d.date);
        if (i < recalcData.length - 1 && orig) {
          return { ...d, rsi: orig.rsi, bollingerBands: orig.bollingerBands };
        }
        return d;
      });

      // Model 업데이트 (리렌더 없음)
      dataModelRef.current[symbol] = finalData;
    },
    [selectedTimeframe],
  );

  // ===== REST API에서 초기 데이터 로드 =====
  const fetchSymbolData = useCallback(
    async (
      symbol: string,
      timeframe: Timeframe,
      forceRefresh: boolean = false,
    ) => {
      setTickerStates((prev) => ({
        ...prev,
        [symbol]: { ...prev[symbol], loading: true, error: null },
      }));

      try {
        const noCacheTimestamp = Date.now();
        const endpoint = `/api/binance/${symbol}?timeframe=${timeframe}${forceRefresh ? "&refresh=true" : ""}&t=${noCacheTimestamp}`;

        const response = await fetch(endpoint, { cache: "no-store" });

        if (!response.ok) {
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

        if (Array.isArray(data) && data.length > 0) {
          // Model에 저장
          dataModelRef.current[symbol] = data;
          signalsModelRef.current[symbol] = signals;
          adviceModelRef.current[symbol] = advice;

          // View에 즉시 반영
          setTickerStates((prev) => ({
            ...prev,
            [symbol]: {
              data,
              signals,
              loading: false,
              error: null,
              advice,
            },
          }));
        } else {
          setTickerStates((prev) => ({
            ...prev,
            [symbol]: {
              ...prev[symbol],
              loading: false,
              error: "No data available",
            },
          }));
        }
      } catch (e: unknown) {
        const errorMessage =
          e instanceof Error ? e.message : "An unknown error occurred";
        console.error(`Failed to fetch data for ${symbol}:`, e);
        setTickerStates((prev) => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            loading: false,
            error: errorMessage,
          },
        }));
      }
    },
    [],
  );

  // ===== 전체 심볼 로드 =====
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

  // ===== WebSocket 연결 =====
  const connectWebSocket = useCallback(
    (symbol: string) => {
      // 기존 연결 정리
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
        wsClientRef.current = null;
      }

      console.log(`[WebSocket] Connecting to ${symbol}...`);

      const ws = createBinanceWebSocket(
        symbol,
        selectedTimeframe,
        (klineData: BinanceKlineData) => {
          // Model만 업데이트 (리렌더 없음)
          updateModel(symbol, klineData);
        },
        (error) => {
          console.error(`[WebSocket] Error for ${symbol}:`, error);
        },
      );

      ws.connect();
      wsClientRef.current = ws;
    },
    [selectedTimeframe, updateModel],
  );

  const disconnectWebSocket = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
  }, []);

  // ===== UI 갱신 타이머 시작 =====
  const startUiUpdateTimer = useCallback(
    (symbol: string) => {
      // 기존 타이머 정리
      if (uiUpdateIntervalRef.current) {
        clearInterval(uiUpdateIntervalRef.current);
        uiUpdateIntervalRef.current = null;
      }

      console.log(`[MVVM] Starting UI update timer for ${symbol}`);

      uiUpdateIntervalRef.current = setInterval(() => {
        // 마지막 업데이트 이후 데이터 변경 확인
        const currentData = dataModelRef.current[symbol];
        const viewData = tickerStates[symbol]?.data;

        if (currentData && currentData !== viewData) {
          const lastCandle = currentData[currentData.length - 1];
          const viewLastCandle = viewData?.[viewData.length - 1];

          // 마지막 봉 변경 시에만 UI 갱신
          if (
            !viewLastCandle ||
            lastCandle.close !== viewLastCandle.close ||
            lastCandle.high !== viewLastCandle.high ||
            lastCandle.low !== viewLastCandle.low ||
            lastCandle.date !== viewLastCandle.date
          ) {
            syncModelToView(symbol);
          }
        }
      }, UI_UPDATE_INTERVAL_MS);
    },
    [syncModelToView, tickerStates],
  );

  const stopUiUpdateTimer = useCallback(() => {
    if (uiUpdateIntervalRef.current) {
      clearInterval(uiUpdateIntervalRef.current);
      uiUpdateIntervalRef.current = null;
    }
  }, []);

  // ===== 초기 로드 =====
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

      // Model 초기화
      dataModelRef.current = {};
      signalsModelRef.current = {};

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

  // ===== 선택 심볼 변경 시 WebSocket + UI타이머 재시작 =====
  useEffect(() => {
    console.log(
      `[MVVM] Symbol/Timeframe changed: ${selectedSymbol} @ ${selectedTimeframe}`,
    );

    connectWebSocket(selectedSymbol);
    startUiUpdateTimer(selectedSymbol);

    return () => {
      disconnectWebSocket();
      stopUiUpdateTimer();
    };
  }, [
    selectedSymbol,
    selectedTimeframe,
    connectWebSocket,
    disconnectWebSocket,
    startUiUpdateTimer,
    stopUiUpdateTimer,
  ]);

  // ===== 언마운트 정리 =====
  useEffect(() => {
    return () => {
      disconnectWebSocket();
      stopUiUpdateTimer();
    };
  }, [disconnectWebSocket, stopUiUpdateTimer]);

  // ===== 종목 선택 핸들러 =====
  const handleSelectSymbol = (symbol: string) => {
    console.log(`[UI] User selected symbol: ${symbol}`);
    setSelectedSymbol(symbol);
  };

  // ===== 레이아웃 심볼 목록 =====
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
