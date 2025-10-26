/* components/StockCollapsibleCard.tsx */

"use client";

import React, { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Minus,
  CircleDollarSign,
  Sparkles, // AI icon
  AlertTriangle, // Error icon
} from "lucide-react";
// Make sure TickerState and TradingSignal are imported
import { TickerState, TradingSignal } from "@/lib/stockUtils"; // Keep AdviceObject import
import {
  StockChartDisplay,
  StockChartDisplayHandles,
} from "./StockChartDisplay";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StockCollapsibleCardProps {
  ticker: string;
  tickerState: TickerState; // Ensure this includes 'advice: AdviceObject | null'
  gridStrokeColor: string;
  isOpen: boolean;
  onOpenChange: () => void;
  currency?: "USD" | "KRW";
}

// --- Existing helper functions (Keep as is) ---
const formatDate = (dateString: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return dateString;
  }
};
const getSignalIcon = (signal: TradingSignal) => {
  if (signal.type === "sell") {
    return <CircleDollarSign className="h-4 w-4 text-green-500" />;
  }
  if (signal.type === "buy") {
    return <TrendingUp className="h-4 w-4 text-blue-500" />;
  }
  if (signal.type === "inverse-buy") {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-gray-500" />;
};
// --- End of existing helper functions ---

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  ticker,
  tickerState, // This now contains 'advice' object
  gridStrokeColor,
  isOpen,
  onOpenChange,
  currency = "USD",
}) => {
  const latestSignal =
    Array.isArray(tickerState.signals) && tickerState.signals.length > 0
      ? tickerState.signals.at(-1)
      : null;
  const chartRef = useRef<StockChartDisplayHandles>(null);

  const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return "-";
    try {
      if (currency === "KRW") {
        return `${Math.round(price).toLocaleString()}원`;
      }
      return `$${price.toFixed(2)}`;
    } catch {
      return String(price);
    }
  };

  const getCardTitleClassName = () => {
    if (!latestSignal) return "";
    const { type, profitRate } = latestSignal;
    if (type.includes("buy")) {
      return "text-blue-500 dark:text-blue-400";
    }
    if (type === "sell") {
      const numericProfitRate =
        typeof profitRate === "number"
          ? profitRate
          : parseFloat(profitRate || "0");
      return numericProfitRate >= 0
        ? "text-green-500 dark:text-green-400"
        : "text-red-500 dark:text-red-400";
    }
    return "";
  };

  // Ensure signals is an array before filtering
  const historicalSignals = Array.isArray(tickerState.signals)
    ? tickerState.signals.filter((s) => s.type !== "hold")
    : [];

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.date;
    chartRef.current?.moveToDate(targetDate);
  };

  // Destructure advice object for easier access
  const adviceObject = tickerState.advice;
  const adviceMessage = adviceObject?.message;
  const hasAdviceError = adviceObject?.error === true;
  // Determine if only advice is loading (data might already be there)
  const isAdviceLoading = tickerState.loading && !adviceObject;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} className="w-full">
      {/* ✅ [수정] Card 컴포넌트의 기본 py-6 패딩을 py-0으로 제거하여 두께를 줄입니다. */}
      <Card className="w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg overflow-hidden py-0">
        <CollapsibleTrigger asChild>
          <CardHeader
            className={cn(
              // ✅ [수정] py-4 (1rem)를 py-2 (0.5rem)로 변경하여 접힌 상태의 높이(두께)를 절반으로 줄입니다.
              "flex flex-row justify-between items-center cursor-pointer transition-colors py-2 px-4 hover:bg-slate-50 dark:hover:bg-slate-800",
              isOpen
                ? "bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700"
                : "",
            )}
          >
            <CardTitle
              className={cn(
                "text-xl font-semibold truncate mr-2", // text-xl 유지 (종목명 크기)
                getCardTitleClassName(),
              )}
            >
              {ticker}
            </CardTitle>
            <div className="flex items-center space-x-2 shrink-0">
              {/* Show general loading only if data isn't loaded yet */}
              {tickerState.loading && !tickerState.data && (
                <span className="text-xs text-blue-500 animate-pulse whitespace-nowrap">
                  데이터 로딩 중...
                </span>
              )}
              {/* Display error only when not loading */}
              {tickerState.error && !tickerState.loading && (
                <span
                  className="text-xs text-red-500 whitespace-nowrap"
                  title={tickerState.error}
                >
                  데이터 오류
                </span>
              )}
              {isOpen ? (
                <ChevronUp className="h-5 w-5 shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* ✅ [수정] Card의 py-0 변경에 따라 CardContent의 패딩을 px-4 (좌우) 및
             pt-4 (상단), pb-4 (하단)로 재설정하여 펼쳤을 때의 내부 여백을 유지합니다.
           */}
          <CardContent className="pt-4 pb-4 px-4">
            {/* --- Existing Signals Table (Moved up) --- */}
            {historicalSignals.length > 0 ? (
              <div className="my-4">
                <h4 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-400">
                  과거 신호 내역
                </h4>
                <div className="overflow-x-auto rounded-md border dark:border-slate-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800">
                        <TableHead className="h-8 px-2 text-xs">기간</TableHead>
                        <TableHead className="h-8 px-2 text-xs">신호</TableHead>
                        <TableHead className="h-8 px-2 text-xs text-right">
                          가격/수익률
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historicalSignals.map((signal, index) => (
                        <TableRow
                          key={index}
                          onClick={() => handleSignalClick(signal)}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <TableCell className="font-mono text-[11px] whitespace-nowrap py-1 px-2">
                            {signal.startDate
                              ? `${formatDate(signal.startDate)} ~ ${formatDate(
                                  signal.date,
                                )}`
                              : formatDate(signal.date)}
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2">
                            <div className="flex items-center gap-1">
                              {getSignalIcon(signal)}
                              <span className="truncate max-w-[150px] sm:max-w-none">
                                {signal.reason}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 text-right font-mono">
                            {signal.type === "sell" &&
                              signal.profitRate !== undefined && (
                                <div className="flex flex-col items-end justify-center">
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      Number(signal.profitRate) >= 0
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-600 dark:text-red-400",
                                    )}
                                  >
                                    {Number(signal.profitRate).toFixed(2)}%
                                  </span>
                                  <span className="text-gray-500 text-[10px] truncate max-w-[80px]">
                                    {signal.details}
                                  </span>
                                </div>
                              )}
                            {signal.type.includes("buy") &&
                              signal.entryPrice !== undefined && (
                                <span className="text-blue-600 dark:text-blue-400">
                                  {formatPrice(signal.entryPrice)}
                                </span>
                              )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : !tickerState.loading && !tickerState.error ? (
              <p className="text-xs text-center text-gray-500 my-4">
                지난 분석 기간 동안 유의미한 매매 신호가 없었습니다.
              </p>
            ) : null}
            {/* --- End Signals Table --- */}

            {/* --- Gemini AI Advice Section (Moved below signals) --- */}
            <div
              className={cn(
                "my-4 p-3 rounded-lg shadow-inner border",
                hasAdviceError
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50"
                  : "bg-gradient-to-r from-blue-50 via-white to-blue-50 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 border-blue-100 dark:border-slate-700",
              )}
            >
              <h4
                className={cn(
                  "text-sm font-semibold mb-2 flex items-center",
                  hasAdviceError
                    ? "text-red-700 dark:text-red-400"
                    : "text-blue-600 dark:text-blue-400",
                )}
              >
                {hasAdviceError ? (
                  <AlertTriangle className="h-4 w-4 mr-2 shrink-0" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2 shrink-0" />
                )}
                Gemini AI 조언 {hasAdviceError ? "(오류)" : ""}
              </h4>
              {/* Show advice loading state specifically */}
              {isAdviceLoading ? (
                <p className="text-xs text-center text-gray-500 animate-pulse">
                  AI 조언을 생성 중입니다...
                </p>
              ) : adviceMessage ? (
                <p
                  className={cn(
                    "text-xs whitespace-pre-line",
                    hasAdviceError
                      ? "text-red-800 dark:text-red-300"
                      : "text-slate-700 dark:text-slate-300",
                  )}
                >
                  {adviceMessage}
                </p>
              ) : (
                <p className="text-xs text-center text-gray-500">
                  {tickerState.error
                    ? "데이터 오류로 조언을 생성할 수 없습니다."
                    : "조언 데이터를 사용할 수 없습니다."}
                </p>
              )}
            </div>
            {/* --- End Gemini AI Advice Section --- */}

            {/* --- Existing Chart Display --- */}
            {tickerState.data && !tickerState.error && (
              <StockChartDisplay
                ref={chartRef}
                data={tickerState.data}
                signals={tickerState.signals}
                gridStrokeColor={gridStrokeColor}
                loading={tickerState.loading && !tickerState.data}
                error={null}
              />
            )}
            {tickerState.error && !tickerState.loading && (
              <div className="text-center text-red-500 text-sm my-4">
                차트 데이터를 불러오지 못했습니다: {tickerState.error}
              </div>
            )}
            {tickerState.loading && !tickerState.data && (
              <div className="text-center text-slate-500 text-sm my-4 h-[250px] flex items-center justify-center">
                차트 로딩 중...
              </div>
            )}
            {/* --- End Chart Display --- */}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

StockCollapsibleCard.displayName = "StockCollapsibleCard";
