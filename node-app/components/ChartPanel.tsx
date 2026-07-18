/* components/ChartPanel.tsx */

"use client";

import React, { useRef, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  CircleDollarSign,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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
  symbol?: string;
}

interface ChartPanelProps {
  symbol: string;
  displayName: string;
  tickerState: TickerState;
  gridStrokeColor: string;
  currency: "USD" | "KRW" | "USDT";
  timeframe?: "1d" | "1h" | "15m";
  apiType?: "kisStock" | "kStock" | "stock" | "binance";
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

export const ChartPanel: React.FC<ChartPanelProps> = ({
  symbol,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  displayName,
  tickerState,
  gridStrokeColor,
  currency,
  timeframe = "1d",
  apiType,
}) => {
  const chartRef = useRef<StockChartDisplayHandles>(null);
  const historyYears = Number(process.env.NEXT_PUBLIC_HISTORY_YEARS) || 1;
  const [isSignalsExpanded, setIsSignalsExpanded] = React.useState(false);

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
      (s) => s.ticker === symbol,
    );
    if (usStock) return usStock;

    const kStock = (stockConfig.k_stocks as StockConfigItem[]).find(
      (s) => s.ticker === symbol,
    );
    if (kStock) return kStock;

    const binanceStock = (
      stockConfig.binance_futures as StockConfigItem[]
    ).find((s) => s.symbol === symbol);
    return binanceStock || null;
  }, [symbol]);

  const isInverseStock = !!stockInfo?.isInverse;
  const inverseTarget = stockInfo?.inverse;

  const cutoffDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - historyYears);
    return date;
  }, [historyYears]);

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

        if (isWithinWindow) {
          validDisplaySignals.push(signal);
        }
      } else if (signal.type === "sell") {
        if (currentPositionType) {
          const isHighRisk =
            (!isInverseStock && currentPositionType === "inverse-buy") ||
            (isInverseStock && currentPositionType === "buy");

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

  const handleSignalClick = (signal: TradingSignal) => {
    const targetDate = signal.date;
    chartRef.current?.moveToDate(targetDate);
  };

  const adviceObject = tickerState.advice;
  const adviceMessage = adviceObject?.message;
  const hasAdviceError = adviceObject?.error === true;
  const isAdviceAvailable = !!adviceObject;

  const isFetching = tickerState.loading;
  const isInitialLoading = tickerState.loading && !tickerState.data;

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 flex flex-col min-h-0 min-w-0">
      <Card className="m-4 md:m-6 bg-white dark:bg-slate-900 shadow-lg flex flex-col flex-1 min-h-0 min-w-0">
        <CardContent className="pt-4 pb-4 px-4 md:px-6 flex flex-col flex-1 min-h-0 min-w-0">
          {/* 포지션 상태 & 매매 신호 테이블 & AI 조언 */}
          {historicalSignals.length > 0 ? (
            <div className="shrink-0">
              <button
                onClick={() => setIsSignalsExpanded(!isSignalsExpanded)}
                className="w-full flex items-center justify-between text-sm font-semibold mb-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    매매 신호
                  </span>
                  {!isFetching && targetSignal && (
                    <>
                      {targetSignal.type.includes("buy") ? (
                        <>
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            {(() => {
                              const isHighRisk =
                                (!isInverseStock &&
                                  targetSignal.type === "inverse-buy") ||
                                (isInverseStock && targetSignal.type === "buy");
                              return isHighRisk
                                ? "(시장 과열 참고 중:"
                                : "(보유 중:";
                            })()}
                          </span>
                          {currentProfitRate !== null && (
                            <span
                              className={cn(
                                "text-xs font-bold",
                                currentProfitRate >= 0
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-red-600 dark:text-red-400",
                              )}
                            >
                              {currentProfitRate > 0 ? "+" : ""}
                              {currentProfitRate.toFixed(2)}%)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            (
                            {timeframe === "1d"
                              ? `${historyYears}년 수익률:`
                              : timeframe === "1h"
                                ? "1달 수익률:"
                                : "1주 수익률:"}
                          </span>
                          {cumulativeProfitRate !== null && (
                            <span
                              className={cn(
                                "text-xs font-bold",
                                cumulativeProfitRate >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400",
                              )}
                            >
                              {cumulativeProfitRate > 0 ? "+" : ""}
                              {cumulativeProfitRate.toFixed(2)}%)
                            </span>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
                {isSignalsExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
              </button>
              {isSignalsExpanded && (
                <>
                  {/* 매매 신호 테이블 */}
                  <div className="overflow-x-auto rounded-md border dark:border-slate-700 mb-4">
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

                          let displayReason = signal.reason;
                          if (isInverseStock && signal.type === "inverse-buy") {
                            const replacementText = inverseTarget
                              ? `이 종목은 ${inverseTarget}의 인버스`
                              : "정방향 매수 구간입니다";

                            if (displayReason.includes("시장 과열 신호")) {
                              displayReason = displayReason.replace(
                                "시장 과열 신호",
                                replacementText,
                              );
                            } else if (
                              displayReason.includes("시장 과열 참고")
                            ) {
                              displayReason = displayReason.replace(
                                "시장 과열 참고",
                                replacementText,
                              );
                            } else if (displayReason.includes("시장 과열")) {
                              displayReason = displayReason.replace(
                                "시장 과열",
                                replacementText,
                              );
                            } else {
                              displayReason = `${replacementText} (${displayReason})`;
                            }
                          } else if (isInverseStock && signal.type === "sell") {
                            const isProfit =
                              signal.profitRate !== undefined &&
                              Number(signal.profitRate) >= 0;
                            const replacementText = isProfit
                              ? "수익 실현"
                              : "손절";

                            if (displayReason.includes("시장 과열 신호 해제")) {
                              displayReason = displayReason.replace(
                                "시장 과열 신호 해제",
                                replacementText,
                              );
                            } else if (
                              displayReason.includes("시장 과열 참고 해제")
                            ) {
                              displayReason = displayReason.replace(
                                "시장 과열 참고 해제",
                                replacementText,
                              );
                            } else if (
                              displayReason.includes("과열 참고 해제")
                            ) {
                              displayReason = displayReason.replace(
                                "과열 참고 해제",
                                replacementText,
                              );
                            } else if (
                              displayReason.includes("시장 과열 해제")
                            ) {
                              displayReason = displayReason.replace(
                                "시장 과열 해제",
                                replacementText,
                              );
                            }
                          }

                          const isRedWarning =
                            (!isInverseStock &&
                              signal.type === "inverse-buy") ||
                            (isInverseStock && signal.type === "buy");

                          let badgeText = "";
                          if (!isInverseStock && signal.type === "buy") {
                            badgeText = "가즈아!";
                          } else if (
                            isInverseStock &&
                            signal.type === "inverse-buy"
                          ) {
                            badgeText = inverseTarget
                              ? `${inverseTarget} 매수`
                              : "정방향 매수";
                          }

                          const showBlueBadge = !!badgeText && !isRedWarning;

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
                                  <span className="sm:max-w-none mr-1">
                                    {displayReason}
                                  </span>
                                  {isRedWarning && (
                                    <span
                                      className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 whitespace-nowrap"
                                      title="시장 상황 지표로만 필히 모니터링 하세요."
                                    >
                                      주의!
                                    </span>
                                  )}
                                  {showBlueBadge && (
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

                  {/* AI 조언 */}
                  <div
                    className={cn(
                      "p-3 rounded-lg shadow-inner border",
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
                </>
              )}
            </div>
          ) : !isInitialLoading && !tickerState.error ? (
            <p className="text-xs text-center text-gray-500 my-4 shrink-0">
              지난 분석 기간 동안 유의미한 매매 신호가 없었습니다.
            </p>
          ) : null}

          {/* 차트 */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            {tickerState.data && !tickerState.error && (
              <StockChartDisplay
                ref={chartRef}
                data={tickerState.data}
                signals={tickerState.signals}
                gridStrokeColor={gridStrokeColor}
                loading={isFetching}
                error={null}
                timeframe={timeframe}
                apiType={apiType}
              />
            )}
            {tickerState.error && !isFetching && (
              <div className="text-center text-red-500 text-sm my-4">
                차트 데이터를 불러오지 못했습니다: {tickerState.error}
              </div>
            )}

            {isInitialLoading && (
              <div className="text-center text-slate-500 text-sm my-4 flex-1 flex items-center justify-center">
                차트 로딩 중...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

ChartPanel.displayName = "ChartPanel";
