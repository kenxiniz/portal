/* components/SymbolSidebar.tsx */

"use client";

import React from "react";
import { TickerState } from "@/lib/stockUtils";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SymbolItem {
  id: string;
  name: string;
}

interface SymbolSidebarProps {
  symbols: SymbolItem[];
  selectedSymbol: string;
  tickerStates: Record<string, TickerState>;
  onSelectSymbol: (symbol: string) => void;
  currency: "USD" | "KRW" | "USDT";
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const SymbolSidebar: React.FC<SymbolSidebarProps> = ({
  symbols,
  selectedSymbol,
  tickerStates,
  onSelectSymbol,
  currency,
  isCollapsed,
  onToggleCollapse,
}) => {
  // 가장 긴 종목명 기준으로 사이드바 너비 계산
  const calculateSidebarWidth = React.useMemo(() => {
    if (symbols.length === 0) return 160;

    const maxLength = Math.max(...symbols.map((s) => s.name.length));
    // 평균 문자 너비 8px + 패딩 24px + 보더 4px + 버퍼 20px
    const estimatedWidth = maxLength * 8 + 48;

    // 최소 160px, 최대 320px
    return Math.min(Math.max(estimatedWidth, 160), 320);
  }, [symbols]);

  // 이전 가격 정보 캐싱 (타임프레임 변경 시 깜빡임 방지)
  const priceCache = React.useRef<
    Record<string, { price: number; rate: number }>
  >({});

  React.useEffect(() => {
    symbols.forEach((symbol) => {
      const state = tickerStates[symbol.id];
      if (state?.data && state.data.length > 0 && !state.loading) {
        const currentPrice = state.data.at(-1)?.close;
        const previousPrice = state.data.at(-2)?.close;
        if (currentPrice && previousPrice) {
          const rate = ((currentPrice - previousPrice) / previousPrice) * 100;
          priceCache.current[symbol.id] = { price: currentPrice, rate };
        }
      }
    });
  }, [symbols, tickerStates]);

  const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return "-";
    try {
      if (currency === "KRW") {
        return `${Math.round(price).toLocaleString()}원`;
      }
      return `$${price.toFixed(2)}`;
    } catch {
      return "-";
    }
  };

  const formatChangeRate = (
    current: number | undefined,
    previous: number | undefined,
  ) => {
    if (!current || !previous) return null;
    const change = ((current - previous) / previous) * 100;
    return change;
  };

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <div
        className={cn(
          "hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300",
          isCollapsed && "w-0 overflow-hidden",
        )}
        style={{
          width: isCollapsed ? 0 : `${calculateSidebarWidth}px`,
        }}
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            종목 목록
          </h2>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="사이드바 접기"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {symbols.map((symbol) => {
            const state = tickerStates[symbol.id];
            const isLoading = state?.loading;

            // 로딩 중이면 캐시된 가격 사용 (깜빡임 방지)
            let currentPrice: number | undefined;
            let changeRate: number | null;

            if (isLoading && priceCache.current[symbol.id]) {
              currentPrice = priceCache.current[symbol.id].price;
              changeRate = priceCache.current[symbol.id].rate;
            } else {
              currentPrice = state?.data?.at(-1)?.close;
              const previousPrice = state?.data?.at(-2)?.close;
              changeRate = formatChangeRate(currentPrice, previousPrice);
            }

            const isSelected = selectedSymbol === symbol.id;

            return (
              <button
                key={symbol.id}
                onClick={() => onSelectSymbol(symbol.id)}
                className={cn(
                  "w-full px-3 py-3 text-left transition-colors border-b border-slate-100 dark:border-slate-800",
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                )}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-sm font-semibold truncate",
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-900 dark:text-slate-100",
                      )}
                    >
                      {symbol.name}
                    </span>
                  </div>

                  {isLoading && !priceCache.current[symbol.id] ? (
                    <span className="text-xs text-slate-500 animate-pulse">
                      로딩 중...
                    </span>
                  ) : currentPrice ? (
                    <>
                      <div className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {formatPrice(currentPrice)}
                      </div>
                      {changeRate !== null && (
                        <div
                          className={cn(
                            "text-xs font-semibold",
                            changeRate >= 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-blue-600 dark:text-blue-400",
                          )}
                        >
                          {changeRate > 0 ? "▲" : "▼"}{" "}
                          {Math.abs(changeRate).toFixed(2)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">-</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 데스크톱 접힌 사이드바 (펼치기 버튼) */}
      {isCollapsed && (
        <div className="hidden md:flex w-12 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 items-start pt-3">
          <button
            onClick={onToggleCollapse}
            className="w-full flex justify-center p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="사이드바 펼치기"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      )}

      {/* 모바일 드롭다운 */}
      <div className="md:hidden w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3">
        <select
          value={selectedSymbol}
          onChange={(e) => onSelectSymbol(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {symbols.map((symbol) => {
            const state = tickerStates[symbol.id];
            const isLoading = state?.loading;

            // 로딩 중이면 캐시된 가격 사용
            const currentPrice =
              isLoading && priceCache.current[symbol.id]
                ? priceCache.current[symbol.id].price
                : state?.data?.at(-1)?.close;

            return (
              <option key={symbol.id} value={symbol.id}>
                {symbol.name}{" "}
                {currentPrice ? `(${formatPrice(currentPrice)})` : ""}
              </option>
            );
          })}
        </select>
      </div>
    </>
  );
};

SymbolSidebar.displayName = "SymbolSidebar";
