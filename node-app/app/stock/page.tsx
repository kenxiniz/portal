/* /app/stock/page.tsx */

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
import { StockLayout } from "@/components/StockLayout";

const tickers = stockConfig.us_stocks.map((t) => t.ticker);

export default function StockPage() {
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

  const [selectedSymbol, setSelectedSymbol] = useState<string>(tickers[0]);
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
        const response = await fetch(`/api/stock/${ticker}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP error! status: ${response.status}`,
          );
        }

        // [MODIFIED] advice 추가
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
    [tickerStates],
  );

  useEffect(() => {
    const loadAllTickersSequentially = async () => {
      if (tickers.length > 0) {
        const firstTicker = tickers[0];
        setSelectedSymbol(firstTicker);
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

  // 종목 선택 핸들러
  const handleSelectSymbol = (ticker: string) => {
    console.log(`[UI] User selected symbol: ${ticker}`);
    setSelectedSymbol(ticker);
  };

  // 레이아웃에 전달할 종목 목록 생성
  const symbolItems = tickers.map((ticker) => ({
    id: ticker,
    name: ticker,
  }));

  return (
    <StockLayout
      title="미국 주식 (Alpha Vantage)"
      apiType="stock"
      symbols={symbolItems}
      selectedSymbol={selectedSymbol}
      tickerStates={tickerStates}
      onSelectSymbol={handleSelectSymbol}
      gridStrokeColor={gridStrokeColor}
      currency="USD"
    />
  );
}
