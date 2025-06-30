"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useThemeDetector } from '@/hooks/useThemeDetector'; /* 테마 훅 import */
import { TickerState, calculateRSI, StockDataPoint } from '@/lib/stockUtils'; /* 유틸리티 import */
import allTickers from '@/lib/stock.json';
import { StockCollapsibleCard } from '@/components/StockCollapsibleCard'; /* 새 컴포넌트 import */

export default function StockPage() {
  /* 모든 티커의 상태를 저장하는 Map */
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>(() => {
    const initialState: Record<string, TickerState> = {};
    allTickers.tickers.forEach(ticker => {
      initialState[ticker] = { data: null, loading: false, error: null };
    });
    return initialState;
  });

  const [openedTickers, setOpenedTickers] = useState<Set<string>>(new Set()); /* 열린 폴딩 카드 관리 */
  const gridStrokeColor = useThemeDetector(); /* 커스텀 훅 사용 */

  const API_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY; 

  /* 주식 데이터 fetching 함수 */
  const fetchStockData = useCallback(async (ticker: string) => {
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      setTickerStates(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], error: "API Key is not configured. Please add your Alpha Vantage API key to a .env.local file (e.g., NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY=YOUR_API_KEY_HERE)." }
      }));
      return;
    }

    setTickerStates(prev => ({
      ...prev,
      [ticker]: { ...prev[ticker], loading: true, error: null }
    }));

    try {
      const response = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${API_KEY}`
      );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data['Time Series (Daily)']) {
          const timeSeries = data['Time Series (Daily)'];
          let chartData: StockDataPoint[] = [];
          const today = new Date();
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(today.getMonth() - 3);

          for (const dateKey in timeSeries) {
            const date = new Date(dateKey);
            if (date >= threeMonthsAgo && date <= today) {
              chartData.push({
                date: dateKey,
                open: parseFloat(timeSeries[dateKey]['1. open']),
                high: parseFloat(timeSeries[dateKey]['2. high']),
                low: parseFloat(timeSeries[dateKey]['3. low']),
                close: parseFloat(timeSeries[dateKey]['4. close']),
                volume: parseFloat(timeSeries[dateKey]['6. volume']),
              });
            }
          }
          chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          /* RSI 계산 */
          const dataWithRSI = calculateRSI(chartData);

          setTickerStates(prev => ({
            ...prev,
            [ticker]: { data: dataWithRSI, loading: false, error: null }
          }));
        } else {
          const errorMessage = data["Note"] || data["Error Message"] || "No data available.";
          console.warn(`No daily time series data for ${ticker}:`, errorMessage);
          setTickerStates(prev => ({
            ...prev,
            [ticker]: { ...prev[ticker], loading: false, error: `No data available for ${ticker}: ${errorMessage}` }
          }));
        }
    } catch (e: any) {
      console.error(`Failed to fetch data for ${ticker}:`, e);
      setTickerStates(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], loading: false, error: `Failed to load data for ${ticker}. Error: ${e.message}` }
      }));
    }
  }, [API_KEY]);

  /* 컴포넌트
   * 마운트
   * 시
   * 첫
   * 번째
   * 티커
   * 데이터
   * 로드
   * */
  useEffect(() => {
      if (allTickers.tickers.length > 0) {
      const firstTicker = allTickers.tickers[0];
      fetchStockData(firstTicker);
      setOpenedTickers(prev => new Set(prev).add(firstTicker));
      }
      }, [fetchStockData]);

  /* 폴딩
   * 카드
   * 토글
   * 핸들러
   * */
  const handleToggleCollapsible = (ticker: string, isOpen: boolean) => {
    setOpenedTickers(prev => {
        const newSet = new Set(prev);
        if (isOpen) {
        newSet.add(ticker);
        if (!tickerStates[ticker].data && !tickerStates[ticker].loading) {
        fetchStockData(ticker);
        }
        } else {
        newSet.delete(ticker);
        }
        return newSet;
        });
  };

  return (
    <div className="flex flex-col items-center p-4 md:p-8 bg-slate-100 dark:bg-slate-950 min-h-screen">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-8">
    주식 포트폴리오
    </h1>

    {tickerStates[allTickers.tickers[0]]?.error && (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
      <strong className="font-bold">Error:</strong>
      <span className="block sm:inline ml-2">{tickerStates[allTickers.tickers[0]].error}</span>
      </div>
    )}

    <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {allTickers.tickers.map((ticker) => {
      const state = tickerStates[ticker];
      const isOpen = openedTickers.has(ticker);

      return (
        <StockCollapsibleCard
        key={ticker}
        ticker={ticker}
        tickerState={state}
        gridStrokeColor={gridStrokeColor}
        isOpen={isOpen}
        onOpenChange={handleToggleCollapsible}
        />
      );
    })}
    </div>
    </div>
  );
}
