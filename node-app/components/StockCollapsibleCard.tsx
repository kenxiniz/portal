/* components/StockCollapsibleCard.tsx */

"use client";

import React, { useRef, useEffect, useMemo } from "react";
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
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { TickerState, TradingSignal } from "@/lib/stockUtils";
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
import stockConfig from "@/lib/stock.json";

interface StockConfigItem {
  ticker: string;
  exchange?: string;
  isInverse?: boolean;
  name?: string;
  inverse?: string;
}

interface StockCollapsibleCardProps {
  displayName: string;
  tickerSymbol: string;
  apiType: "kisStock" | "kStock" | "stock";
  tickerState: TickerState;
  gridStrokeColor: string;
  isOpen: boolean;
  onOpenChange: () => void;
  currency?: "USD" | "KRW";
  timeframe?: "1d" | "1h" | "15m";
}

const formatDateTime = (
  dateString: string,
  timeframe?: "1d" | "1h" | "15m",
) => {
  if (!dateString) return "-";
  try {
    const safeDateStr = dateString.includes(" ")
      ? dateString.replace(" ", "T")
      : dateString;
    const date = new Date(safeDateStr);

    if (isNaN(date.getTime())) return dateString;

    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    if (!timeframe || timeframe === "1d") {
      return `${year}-${month}-${day}`;
    } else {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
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

export const StockCollapsibleCard: React.FC<StockCollapsibleCardProps> = ({
  displayName,
  tickerSymbol,
  tickerState,
  gridStrokeColor,
  isOpen,
  onOpenChange,
  currency = "USD",
  timeframe = "1d",
}) => {
  const chartRef = useRef<StockChartDisplayHandles>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Get history years from env, default to 1
  const historyYears = Number(process.env.NEXT_PUBLIC_HISTORY_YEARS) || 1;

  const targetSignal = useMemo(() => {
    if (!Array.isArray(tickerState.signals) || tickerState.signals.length === 0)
      return null;
    for (let i = tickerState.signals.length - 1; i >= 0; i--) {
      if (tickerState.signals[i].type !== "hold") {
        return tickerState.signals[i];
      }
    }
    return null;
  }, [tickerState.signals]);

  const stockInfo = useMemo(() => {
    const usStock = (stockConfig.us_stocks as StockConfigItem[]).find(
      (s) => s.ticker === tickerSymbol,
    );
    if (usStock) return usStock;

    const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
      (s) => s.ticker === tickerSymbol,
    );
    return kStock || null;
  }, [tickerSymbol]);

  const isInverseStock = !!stockInfo?.isInverse;
  const inverseTarget = stockInfo?.inverse;

  // Calculate cutoff date based on history years
  const cutoffDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - historyYears);
    return date;
  }, [historyYears]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const focusTicker = urlParams.get("ticker");

    if (focusTicker === tickerSymbol && isOpen && cardContainerRef.current) {
      setTimeout(() => {
        if (cardContainerRef.current) {
          const elementTop =
            cardContainerRef.current.getBoundingClientRect().top;
          const y = elementTop + window.scrollY - 20;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      }, 300);
    }
  }, [isOpen, tickerSymbol]);

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

  const currentPrice = tickerState.data?.at(-1)?.close;

  const currentProfitRate = useMemo(() => {
    if (!targetSignal || !currentPrice || targetSignal.entryPrice === undefined)
      return null;

    if (targetSignal.type === "buy") {
      return (
        ((currentPrice - targetSignal.entryPrice) / targetSignal.entryPrice) *
        100
      );
    } else if (targetSignal.type === "inverse-buy") {
      return (
        ((targetSignal.entryPrice - currentPrice) / targetSignal.entryPrice) *
        100
      );
    }
    return null;
  }, [targetSignal, currentPrice]);

  // Calculate cumulative profit and filter historical signals based on sell date
  const { historicalSignals, cumulativeProfitRate } = useMemo(() => {
    if (!Array.isArray(tickerState.signals))
      return { historicalSignals: [], cumulativeProfitRate: null };

    let oldestChartDate = new Date(0);
    if (tickerState.data && tickerState.data.length > 0) {
      const firstDateStr = tickerState.data[0].date.includes(" ")
        ? tickerState.data[0].date.replace(" ", "T")
        : tickerState.data[0].date;
      oldestChartDate = new Date(firstDateStr);
    }

    const limitDate = timeframe === "1d" ? cutoffDate : oldestChartDate;

    let capital = 1000000;
    let hasTrades = false;
    let currentPositionType: string | null = null;
    let currentBuySignal: TradingSignal | null = null;

    const validDisplaySignals: TradingSignal[] = [];

    tickerState.signals.forEach((signal) => {
      if (signal.type === "hold") return;

      const safeDateStr = signal.date.includes(" ")
        ? signal.date.replace(" ", "T")
        : signal.date;
      const signalDate = new Date(safeDateStr);
      const isWithinWindow = signalDate >= limitDate;

      if (signal.type === "buy" || signal.type === "inverse-buy") {
        currentPositionType = signal.type;
        currentBuySignal = signal;

        // Add buy signal if it falls within the window
        if (isWithinWindow) {
          validDisplaySignals.push(signal);
        }
      } else if (signal.type === "sell") {
        if (currentPositionType) {
          const isHighRisk =
            (isInverseStock && currentPositionType === "buy") ||
            (!isInverseStock && currentPositionType === "inverse-buy");

          // Include in cumulative profit if sell signal is within the window
          if (isWithinWindow) {
            if (
              !isHighRisk &&
              signal.profitRate !== undefined &&
              signal.profitRate !== null
            ) {
              const rate = Number(signal.profitRate);
              if (!isNaN(rate)) {
                capital = capital * (1 + rate / 100);
                hasTrades = true;
              }
            }

            // Add matching buy signal if sell is within window but buy is older
            if (
              currentBuySignal &&
              new Date(
                currentBuySignal.date.includes(" ")
                  ? currentBuySignal.date.replace(" ", "T")
                  : currentBuySignal.date,
              ) < limitDate
            ) {
              validDisplaySignals.push(currentBuySignal);
            }

            validDisplaySignals.push(signal);
          }

          currentPositionType = null;
          currentBuySignal = null;
        }
      }
    });

    return {
      historicalSignals: validDisplaySignals,
      cumulativeProfitRate: hasTrades
        ? ((capital - 1000000) / 1000000) * 100
        : null,
    };
  }, [
    tickerState.signals,
    tickerState.data,
    timeframe,
    cutoffDate,
    isInverseStock,
  ]);

  const getCardTitleClassName = () => {
    if (!targetSignal) return "";
    const { type } = targetSignal;

    if (type.includes("buy") && currentProfitRate !== null) {
      const isHighRisk =
        (isInverseStock && type === "buy") ||
        (!isInverseStock && type === "inverse-buy");

      if (isHighRisk) {
        return "text-slate-500 dark:text-slate-400";
      }

      return currentProfitRate >= 0
        ? "text-blue-500 dark:text-blue-400"
        : "text-red-500 dark:text-red-400";
    }

    if (type === "sell" && cumulativeProfitRate !== null) {
      return cumulativeProfitRate >= 0
        ? "text-green-500 dark:text-green-400"
        : "text-red-500 dark:text-red-400";
    }
    return "";
  };

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.date;
    chartRef.current?.moveToDate(targetDate);
  };

  const adviceObject = tickerState.advice;
  const adviceMessage = adviceObject?.message;
  const hasAdviceError = adviceObject?.error === true;
  const isAdviceAvailable = !!adviceObject;

  // Separate fetching and initial loading states
  const isFetching = tickerState.loading;
  const isInitialLoading = tickerState.loading && !tickerState.data;

  return (
    <div
      ref={cardContainerRef}
      id={`stock-card-${tickerSymbol}`}
      className="w-full"
    >
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
                className={cn("text-xl truncate mr-2", getCardTitleClassName())}
              >
                <span className="font-bold">{displayName}</span>

                {/* Hide profit rate texts completely while fetching */}
                {!isFetching &&
                  targetSignal &&
                  targetSignal.type.includes("buy") &&
                  currentProfitRate !== null && (
                    <span className="font-normal text-base ml-1.5">
                      {(() => {
                        const isHighRisk =
                          (isInverseStock && targetSignal.type === "buy") ||
                          (!isInverseStock &&
                            targetSignal.type === "inverse-buy");
                        const sign = currentProfitRate > 0 ? "+" : "";

                        // Update text for inverse/high-risk signals
                        if (isHighRisk) {
                          return `[시장 과열 참고 중: ${sign}${currentProfitRate.toFixed(2)}%]`;
                        } else {
                          return `[보유 중: ${sign}${currentProfitRate.toFixed(2)}%]`;
                        }
                      })()}
                    </span>
                  )}

                {!isFetching &&
                  targetSignal &&
                  targetSignal.type === "sell" &&
                  cumulativeProfitRate !== null && (
                    <span className="font-normal text-base ml-1.5">
                      [
                      {timeframe === "1d"
                        ? `${historyYears}년 수익`
                        : timeframe === "1h"
                          ? "1달 수익"
                          : "1주 수익"}
                      : {cumulativeProfitRate > 0 ? "+" : ""}
                      {cumulativeProfitRate.toFixed(2)}%]
                    </span>
                  )}
              </CardTitle>

              <div className="flex items-center space-x-2 shrink-0">
                {/* Show loading text during any fetch operation */}
                {isFetching && (
                  <span className="text-xs text-blue-500 animate-pulse whitespace-nowrap">
                    데이터 로딩 중...
                  </span>
                )}
                {tickerState.error && !isFetching && (
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
              {historicalSignals.length > 0 ? (
                <div className="my-4">
                  <h4 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-400">
                    {timeframe === "1d"
                      ? `최근 ${historyYears}년 신호 내역`
                      : "차트 내 매매 신호 내역"}
                  </h4>
                  <div className="overflow-x-auto rounded-md border dark:border-slate-700">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800">
                          <TableHead className="h-8 px-2 text-xs">
                            신호 날짜
                          </TableHead>
                          <TableHead className="h-8 px-2 text-xs">
                            신호
                          </TableHead>
                          <TableHead className="h-8 px-2 text-xs text-right">
                            가격/수익률
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historicalSignals.map((signal, index) => {
                          const isBuySignal = signal.type.includes("buy");
                          const isLatestOpenPosition =
                            index === historicalSignals.length - 1 &&
                            isBuySignal;

                          const showHighRiskWarning =
                            (isInverseStock && signal.type === "buy") ||
                            (!isInverseStock && signal.type === "inverse-buy");

                          // Determine badge content: inverse specified text vs default gazua
                          let badgeText = "가즈아!";
                          if (
                            isInverseStock &&
                            signal.type === "inverse-buy" &&
                            inverseTarget
                          ) {
                            badgeText = `${inverseTarget} 매수!`;
                          } else if (
                            !isInverseStock &&
                            signal.type === "buy"
                          ) {
                            badgeText = "가즈아!";
                          }

                          const showBadge =
                            (!isInverseStock && signal.type === "buy") ||
                            (isInverseStock && signal.type === "inverse-buy");

                          let rowCurrentProfitRate = null;
                          if (
                            isLatestOpenPosition &&
                            currentPrice &&
                            signal.entryPrice
                          ) {
                            if (signal.type === "buy") {
                              rowCurrentProfitRate =
                                ((currentPrice - signal.entryPrice) /
                                  signal.entryPrice) *
                                100;
                            } else if (signal.type === "inverse-buy") {
                              rowCurrentProfitRate =
                                ((signal.entryPrice - currentPrice) /
                                  signal.entryPrice) *
                                100;
                            }
                          }

                          return (
                            <TableRow
                              key={index}
                              onClick={() => handleSignalClick(signal)}
                              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <TableCell className="font-mono text-[11px] whitespace-nowrap py-1 px-2">
                                {formatDateTime(signal.date, timeframe)}
                              </TableCell>
                              <TableCell className="text-xs py-1 px-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {getSignalIcon(signal)}
                                  <span className="sm:max-w-none">
                                    {signal.reason}
                                  </span>
                                  {showHighRiskWarning && (
                                    <span
                                      className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 whitespace-nowrap"
                                      title="인버스 투자는 리스크가 매우 크므로 시장 과열 지표로만 참고하세요."
                                    >
                                      시장 과열 참고
                                    </span>
                                  )}
                                  {showBadge && (
                                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                                      {badgeText}
                                    </span>
                                  )}
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
                                      <span className="text-gray-500 text-[10px] whitespace-nowrap">
                                        {signal.realizedPrice !== undefined
                                          ? formatPrice(signal.realizedPrice)
                                          : signal.details}
                                      </span>
                                    </div>
                                  )}
                                {isBuySignal &&
                                  signal.entryPrice !== undefined && (
                                    <div className="flex flex-col items-end justify-center">
                                      <span className="text-blue-600 dark:text-blue-400">
                                        {formatPrice(signal.entryPrice)}
                                      </span>
                                      {rowCurrentProfitRate !== null && (
                                        <span
                                          className={cn(
                                            "text-[10px] font-bold whitespace-nowrap",
                                            rowCurrentProfitRate >= 0
                                              ? "text-green-600"
                                              : "text-red-600",
                                          )}
                                        >
                                          {rowCurrentProfitRate > 0 ? "+" : ""}
                                          {rowCurrentProfitRate.toFixed(2)}% (
                                          {signal.type === "inverse-buy"
                                            ? rowCurrentProfitRate > 0
                                              ? "참고 수익"
                                              : "참고 손실"
                                            : rowCurrentProfitRate > 0
                                              ? "개이득 중"
                                              : "눈물"}
                                          )
                                        </span>
                                      )}
                                    </div>
                                  )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : !isInitialLoading && !tickerState.error ? (
                <p className="text-xs text-center text-gray-500 my-4">
                  지난 분석 기간 동안 유의미한 매매 신호가 없었습니다.
                </p>
              ) : null}

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

                {hasAdviceError ? (
                  <p
                    className={cn(
                      "text-xs whitespace-pre-line",
                      "text-red-800 dark:text-red-300",
                    )}
                  >
                    {adviceMessage}
                  </p>
                ) : isAdviceAvailable && adviceMessage ? (
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
                      : "AI 조언이 아직 준비되지 않았습니다."}
                  </p>
                )}
              </div>

              {tickerState.data && !tickerState.error && (
                <StockChartDisplay
                  ref={chartRef}
                  data={tickerState.data}
                  signals={tickerState.signals}
                  gridStrokeColor={gridStrokeColor}
                  loading={isFetching}
                  error={null}
                  timeframe={timeframe}
                />
              )}
              {tickerState.error && !isFetching && (
                <div className="text-center text-red-500 text-sm my-4">
                  차트 데이터를 불러오지 못했습니다: {tickerState.error}
                </div>
              )}

              {/* Show initial loading placeholder only when no data is present */}
              {isInitialLoading && (
                <div className="text-center text-slate-500 text-sm my-4 h-[250px] flex items-center justify-center">
                  차트 로딩 중...
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};

StockCollapsibleCard.displayName = "StockCollapsibleCard";