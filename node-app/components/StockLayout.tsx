/* components/StockLayout.tsx */

"use client";

import React, { useState } from "react";
import { TickerState } from "@/lib/stockUtils";
import { SymbolSidebar } from "./SymbolSidebar";
import { ChartPanel } from "./ChartPanel";

type Timeframe = "1d" | "1h" | "15m";

interface SymbolItem {
  id: string;
  name: string;
}

interface StockLayoutProps {
  title: string;
  apiType: "kisStock" | "kStock" | "stock" | "binance";
  symbols: SymbolItem[];
  selectedSymbol: string;
  tickerStates: Record<string, TickerState>;
  onSelectSymbol: (symbol: string) => void;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  headerButtons?: React.ReactNode;
  gridStrokeColor: string;
  currency: "USD" | "KRW" | "USDT";
}

export const StockLayout: React.FC<StockLayoutProps> = ({
  title,
  apiType,
  symbols,
  selectedSymbol,
  tickerStates,
  onSelectSymbol,
  timeframe,
  onTimeframeChange,
  headerButtons,
  gridStrokeColor,
  currency,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const selectedState = tickerStates[selectedSymbol];
  const selectedSymbolInfo = symbols.find((s) => s.id === selectedSymbol);

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-950">
      {/* 상단 헤더 */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-8 py-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* 타이틀 */}
          <div className="flex flex-col md:flex-row items-center gap-4">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              {title}
            </h1>
          </div>

          {/* 우측 버튼들 */}
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Timeframe 버튼 */}
            {timeframe && onTimeframeChange && (
              <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-full md:w-auto justify-center shrink-0">
                <button
                  onClick={() => onTimeframeChange("1d")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeframe === "1d"
                      ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  일봉
                </button>
                <button
                  onClick={() => onTimeframeChange("1h")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeframe === "1h"
                      ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  1시간 봉
                </button>
                <button
                  onClick={() => onTimeframeChange("15m")}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    timeframe === "15m"
                      ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  15분 봉
                </button>
              </div>
            )}

            {/* 페이지별 추가 버튼 */}
            {headerButtons && (
              <div className="flex flex-row items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                {headerButtons}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠: 사이드바 + 차트 */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <SymbolSidebar
          symbols={symbols}
          selectedSymbol={selectedSymbol}
          tickerStates={tickerStates}
          onSelectSymbol={onSelectSymbol}
          currency={currency}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {selectedSymbolInfo && selectedState && (
          <ChartPanel
            symbol={selectedSymbol}
            displayName={selectedSymbolInfo.name}
            tickerState={selectedState}
            gridStrokeColor={gridStrokeColor}
            currency={currency}
            timeframe={timeframe}
            apiType={apiType}
          />
        )}
      </div>
    </div>
  );
};

StockLayout.displayName = "StockLayout";
