/* components/StockCollapsibleCard.tsx */

"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
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
import { TickerState, TradingSignal, AdviceObject } from "@/lib/stockUtils";
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
  displayName: string;
  tickerSymbol: string;
  apiType: "kisStock" | "kStock" | "stock"; // This prop is now correct
  tickerState: TickerState;
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
  displayName,
  tickerSymbol,
  apiType,
  tickerState,
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

  const [advice, setAdvice] = useState<AdviceObject | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);

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

  const historicalSignals = Array.isArray(tickerState.signals)
    ? tickerState.signals.filter((s) => s.type !== "hold")
    : [];

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.date;
    chartRef.current?.moveToDate(targetDate);
  };

  // MODIFIED: fetchAdvice now uses POST to the common /api/advice route
  const fetchAdvice = useCallback(async () => {
    // Prevent fetching if signals aren't loaded yet
    if (!tickerState.signals || tickerState.signals.length === 0) {
      setAdvice({
        error: true,
        message: "매매 신호 데이터가 없어 조언을 생성할 수 없습니다.",
      });
      return;
    }

    setIsAdviceLoading(true);
    try {
      // NEW: Call the single /api/advice endpoint
      const response = await fetch(`/api/advice`, {
        method: "POST", // Use POST
        headers: {
          "Content-Type": "application/json",
        },
        // Send all necessary info in the body
        body: JSON.stringify({
          ticker: tickerSymbol,
          apiType: apiType,
          signals: tickerState.signals, // Send signals to API
        }),
      });

      // The API will now wait, so we expect a full response (no null)
      const adviceData: AdviceObject = await response.json();

      if (!response.ok) {
        // Throw an error to be caught below
        throw new Error(adviceData.message || "Advice API failed");
      }

      setAdvice(adviceData);
    } catch (e) {
      setAdvice({
        error: true,
        message: `조언 로딩 실패: ${
          e instanceof Error ? e.message : "Unknown error"
        }`,
      });
    } finally {
      setIsAdviceLoading(false); // Stop loading when done (success or fail)
    }
  }, [apiType, tickerSymbol, tickerState.signals]); // Depends on signals

  // useEffect to trigger advice fetch when card is opened
  useEffect(() => {
    // Only fetch advice if:
    // 1. The card is open
    // 2. Main data is loaded (!tickerState.loading)
    // 3. There is no main data error (!tickerState.error)
    // 4. We don't already have advice (!advice)
    // 5. We are not already loading advice (!isAdviceLoading)
    if (
      isOpen &&
      !tickerState.loading &&
      !tickerState.error &&
      !advice &&
      !isAdviceLoading
    ) {
      fetchAdvice();
    }
    // REMOVED: Polling logic is gone
  }, [
    isOpen,
    tickerState.loading,
    tickerState.error,
    advice,
    isAdviceLoading,
    fetchAdvice,
  ]);

  const adviceObject = advice;
  const adviceMessage = adviceObject?.message;
  const hasAdviceError = adviceObject?.error === true;
  const isMainDataLoading = tickerState.loading && !tickerState.data;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} className="w-full">
      <Card className="w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-lg rounded-lg overflow-hidden py-0">
        <CollapsibleTrigger asChild>
          <CardHeader
            className={cn(
              "flex flex-row justify-between items-center cursor-pointer transition-colors py-2 px-4 hover:bg-slate-50 dark:hover:bg-slate-800",
              isOpen
                ? "bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700"
                : "",
            )}
          >
            <CardTitle
              className={cn(
                "text-xl font-semibold truncate mr-2",
                getCardTitleClassName(),
              )}
            >
              {displayName}
            </CardTitle>
            <div className="flex items-center space-x-2 shrink-0">
              {isMainDataLoading && (
                <span className="text-xs text-blue-500 animate-pulse whitespace-nowrap">
                  데이터 로딩 중...
                </span>
              )}
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
          <CardContent className="pt-4 pb-4 px-4">
            {/* --- Signals Table --- */}
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
            ) : !isMainDataLoading && !tickerState.error ? (
              <p className="text-xs text-center text-gray-500 my-4">
                지난 분석 기간 동안 유의미한 매매 신호가 없었습니다.
              </p>
            ) : null}
            {/* --- End Signals Table --- */}

            {/* --- Gemini AI Advice Section --- */}
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

              {/* MODIFIED: This logic now correctly handles waiting */}
              {isAdviceLoading ? (
                <p className="text-xs text-center text-gray-500 animate-pulse">
                  AI 조언을 생성 중입니다...
                </p>
              ) : hasAdviceError ? (
                <p
                  className={cn(
                    "text-xs whitespace-pre-line",
                    "text-red-800 dark:text-red-300",
                  )}
                >
                  {adviceMessage}
                </p>
              ) : adviceMessage ? (
                <p
                  className={cn(
                    "text-xs whitespace-pre-line",
                    "text-slate-700 dark:text-slate-300",
                  )}
                >
                  {adviceMessage}
                </p>
              ) : (
                <p className="text-xs text-center text-gray-500">
                  {tickerState.error
                    ? "데이터 오류로 조언을 생성할 수 없습니다."
                    : "조언을 보려면 카드를 열어주세요."}
                </p>
              )}
            </div>
            {/* --- End Gemini AI Advice Section --- */}

            {/* --- Chart Display --- */}
            {tickerState.data && !tickerState.error && (
              <StockChartDisplay
                ref={chartRef}
                data={tickerState.data}
                signals={tickerState.signals}
                gridStrokeColor={gridStrokeColor}
                loading={isMainDataLoading}
                error={null}
              />
            )}
            {tickerState.error && !tickerState.loading && (
              <div className="text-center text-red-500 text-sm my-4">
                차트 데이터를 불러오지 못했습니다: {tickerState.error}
              </div>
            )}
            {isMainDataLoading && (
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
