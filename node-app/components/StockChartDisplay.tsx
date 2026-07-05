/* components/StockChartDisplay.tsx */
"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { StockDataPoint, TradingSignal } from "@/lib/stockUtils";
import {
  Time,
  IChartApi,
  LogicalRange,
  LineData,
  HistogramData,
} from "lightweight-charts";
import {
  calculateMacdKama,
  getMacdStatus,
  calculateProbabilityLevels,
  calculateEMA,
  calculateVWAP,
} from "@/lib/charts/indicators";
import { MainChart } from "./charts/MainChart";
import { RsiChart } from "./charts/RsiChart";
import { MacdChart } from "./charts/MacdChart";
import { PivotChart } from "./charts/PivotChart";

export interface ProcessedChartData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  color?: string;
  rsi?: number;
  upper?: number;
  lower?: number;
  date: string;
  vwap?: number;
  ema9?: number;
  ema20?: number;
}

interface StockChartDisplayProps {
  data: StockDataPoint[] | null;
  signals: TradingSignal[];
  gridStrokeColor: string;
  loading: boolean;
  error: string | null;
  timeframe?: "1d" | "1h" | "15m";
}

export interface StockChartDisplayHandles {
  moveToDate: (date: string) => void;
}

type ExtendedDataPoint = StockDataPoint & {
  vwap?: number | null;
  ema9?: number | null;
  ema20?: number | null;
};

// Helper function to convert raw US Eastern Time (ET) to Korean Standard Time (KST)
const convertEstToKst = (dateStr: string): { date: string; time: Time } => {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T\s\n](\d{2}):(\d{2})/);
  if (!match) {
    const ts = Math.floor(new Date(dateStr.replace(" ", "T")).getTime() / 1000);
    return { date: dateStr, time: (isNaN(ts) ? 0 : ts) as Time };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const min = parseInt(match[5], 10);

  // Dynamic US Daylight Saving Time (DST) calculation
  // Starts: 2nd Sunday of March, Ends: 1st Sunday of November
  const march1 = new Date(Date.UTC(year, 2, 1));
  const dstStartDay = 1 + ((14 - march1.getUTCDay()) % 7) + 7;
  const dstStart = new Date(Date.UTC(year, 2, dstStartDay, 7, 0, 0)).getTime();

  const nov1 = new Date(Date.UTC(year, 10, 1));
  const dstEndDay = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, dstEndDay, 6, 0, 0)).getTime();

  const estUtcEstimate = Date.UTC(year, month, day, hour + 5, min, 0);
  const isDst = estUtcEstimate >= dstStart && estUtcEstimate < dstEnd;
  const offset = isDst ? -4 : -5;

  const utcTs = Date.UTC(year, month, day, hour - offset, min, 0);
  const kstDate = new Date(utcTs + 9 * 60 * 60 * 1000);

  const kstY = kstDate.getUTCFullYear();
  const kstM = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const kstD = String(kstDate.getUTCDate()).padStart(2, "0");
  const kstH = String(kstDate.getUTCHours()).padStart(2, "0");
  const kstMin = String(kstDate.getUTCMinutes()).padStart(2, "0");

  return {
    date: `${kstY}-${kstM}-${kstD} ${kstH}:${kstMin}:00`,
    time: Math.floor(utcTs / 1000) as Time,
  };
};

export const StockChartDisplay = forwardRef<
  StockChartDisplayHandles,
  StockChartDisplayProps
>(function StockChartDisplay(
  { data, signals, gridStrokeColor, loading, error, timeframe = "1d" },
  ref,
) {
  const [mainChart, setMainChart] = useState<IChartApi | null>(null);
  const [rsiChart, setRsiChart] = useState<IChartApi | null>(null);
  const [macdChart, setMacdChart] = useState<IChartApi | null>(null);
  const [pivotChart, setPivotChart] = useState<IChartApi | null>(null);

  const [chartHeights, setChartHeights] = useState({ main: 250, sub: 100 });
  const isInitialZoomApplied = useRef(false);
  const isMovingToDate = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isApplyingZoom = useRef(false);

  // 전역 zoom 저장 (모든 타임프레임 공통, localStorage 저장)
  const globalZoom = useRef<number | null>(null);
  const lastBarCount = useRef<number | null>(null);

  // localStorage에서 zoom 로드 (초기화 시 1회)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("chartZoom");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) {
          globalZoom.current = parsed;
          console.log(`[ZOOM] Loaded from localStorage: ${parsed} bars`);
        }
      }
    } catch (e) {
      console.warn("[ZOOM] Failed to load from localStorage", e);
    }
  }, []);

  // 사용자 zoom 추적 (range 길이 변경만, 전역 저장)
  useEffect(() => {
    if (!mainChart) return;

    const handleRangeChange = (range: LogicalRange | null) => {
      if (!range || isApplyingZoom.current || isMovingToDate.current) return;

      const barCount = Math.round(range.to - range.from);

      // 첫 실행 시 기준 설정
      if (lastBarCount.current === null) {
        lastBarCount.current = barCount;
        return;
      }

      // zoom 감지: range 길이 변경 (scroll은 길이 동일)
      if (barCount !== lastBarCount.current) {
        globalZoom.current = barCount;
        lastBarCount.current = barCount;

        // localStorage 저장
        try {
          localStorage.setItem("chartZoom", barCount.toString());
          console.log(`[ZOOM] User zoom saved: ${barCount} bars`);
        } catch (e) {
          console.warn("[ZOOM] Failed to save to localStorage", e);
        }
      }
    };

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    return () => {
      mainChart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      lastBarCount.current = null;
    };
  }, [mainChart]);

  // timeframe 변경 시 isInitialZoomApplied 리셋
  useEffect(() => {
    isInitialZoomApplied.current = false;
  }, [timeframe]);

  useEffect(() => {
    const updateChartHeights = () => {
      if (!containerRef.current) return;

      const containerHeight = containerRef.current.clientHeight;

      // 전체 차트 개수 계산
      const totalMainCharts = ["1h", "15m"].includes(timeframe) ? 2 : 1; // Main + Pivot or Main only
      const totalCharts = totalMainCharts + 2; // + RSI + MACD

      // 전체 높이에서 gap(4px * (차트개수-1))를 빼고 분배
      const totalGap = 4 * (totalCharts - 1);
      const availableHeight = containerHeight - totalGap;

      // Sub charts: 10% each (RSI, MACD)
      // Main chart(s): 80% (1h/15m에서 Main과 Pivot이 공유)
      const subHeight = Math.floor(availableHeight * 0.1);
      const mainHeight = Math.floor((availableHeight * 0.8) / totalMainCharts);

      setChartHeights({
        main: Math.max(mainHeight, 200),
        sub: Math.max(subHeight, 80),
      });

      // autoSize가 활성화되어 있으므로 컨테이너 크기 변경은 자동 감지
      // fitContent()를 호출하지 않음 → 초기 줌 설정(고정 visible bars) 유지
    };

    updateChartHeights();

    // 화면 크기 변경 시 동적으로 업데이트
    const resizeObserver = new ResizeObserver(updateChartHeights);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [timeframe, mainChart, pivotChart, rsiChart, macdChart]);

  const { processedData, closePrices } = useMemo(() => {
    if (!data || data.length === 0)
      return { processedData: [], closePrices: [] };

    // Detect if incoming dataset uses raw US Eastern Time stamps
    const isUsRawEt = data.slice(0, 20).some((d) => {
      if (!d?.date) return false;
      const hour = parseInt(d.date.split(/[T\s]/)[1]?.split(":")[0] || "0", 10);
      return hour >= 4 && hour <= 8;
    });

    const cleanData = data
      .filter((d) => d?.date)
      .map((d) => {
        if (isUsRawEt && timeframe !== "1d") {
          const converted = convertEstToKst(d.date);
          return { ...d, date: converted.date, chartTime: converted.time };
        } else {
          const formatTime = (dStr: string): Time => {
            if (timeframe === "1d")
              return dStr.split("T")[0].split(" ")[0] as Time;
            const ts = Math.floor(
              new Date(dStr.replace(" ", "T")).getTime() / 1000,
            );
            return isNaN(ts) ? (0 as Time) : (ts as Time);
          };
          return { ...d, chartTime: formatTime(d.date) };
        }
      })
      .filter((d) => d.chartTime !== 0);

    cleanData.sort((a, b) =>
      typeof a.chartTime === "number" && typeof b.chartTime === "number"
        ? a.chartTime - b.chartTime
        : new Date(a.chartTime as string).getTime() -
          new Date(b.chartTime as string).getTime(),
    );

    const uniqueData = cleanData.filter(
      (v, i, a) => a.findIndex((t) => t.chartTime === v.chartTime) === i,
    );
    const closes = uniqueData.map((d) => Number(d.close));

    const vwapResults = calculateVWAP(uniqueData, timeframe);
    const ema9Results = calculateEMA(closes, 9);
    const ema20Results = calculateEMA(closes, 20);

    let isHolding = false;

    const processed = uniqueData.map((d, i) => {
      const signalsOnDate = signals.filter((s) => s.date === d.date);
      let turnOn = false;
      let turnOff = false;

      signalsOnDate.forEach((s) => {
        if (s.type === "buy" || s.type === "inverse-buy") turnOn = true;
        if (s.type === "sell") turnOff = true;
      });

      if (turnOn) isHolding = true;

      const isPatternFormation = signals.some(
        (s) =>
          s.startDate &&
          d.date >= s.startDate &&
          d.date <= s.date &&
          s.type.includes("buy"),
      );

      let highlightColor: string | undefined = undefined;
      if (isHolding || turnOff) {
        highlightColor = "#FFB6C1";
      } else if (isPatternFormation) {
        highlightColor = "#FFEB3B";
      }

      if (turnOff) isHolding = false;

      const extD = d as ExtendedDataPoint;

      return {
        time: d.chartTime,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
        color: highlightColor,
        rsi: typeof d.rsi === "number" && !isNaN(d.rsi) ? d.rsi : undefined,
        upper: d.bollingerBands?.upper,
        lower: d.bollingerBands?.lower,
        vwap:
          typeof extD.vwap === "number" && !isNaN(extD.vwap)
            ? extD.vwap
            : vwapResults[i] !== null
              ? vwapResults[i]
              : undefined,
        ema9:
          typeof extD.ema9 === "number" && !isNaN(extD.ema9)
            ? extD.ema9
            : ema9Results[i] !== null
              ? ema9Results[i]
              : undefined,
        ema20:
          typeof extD.ema20 === "number" && !isNaN(extD.ema20)
            ? extD.ema20
            : ema20Results[i] !== null
              ? ema20Results[i]
              : undefined,
        date: d.date.replace(/[ T]/, "\n"),
      } as ProcessedChartData;
    });

    return { processedData: processed, closePrices: closes };
  }, [data, signals, timeframe]);

  const probLevels = useMemo(
    () => calculateProbabilityLevels(closePrices),
    [closePrices],
  );

  const macdResult = useMemo(() => {
    if (!closePrices.length)
      return {
        data: { line: [], signal: [], hist: [] },
        status: { title: "MACD", color: "#2e7d32", value: 0 },
      };

    const { macdLineRaw, signalLineRaw, histogramRaw } =
      calculateMacdKama(closePrices);
    const status = getMacdStatus(macdLineRaw, signalLineRaw);

    const line: LineData[] = [];
    const signal: LineData[] = [];
    const hist: HistogramData[] = [];

    processedData.forEach((d, i) => {
      if (macdLineRaw[i] !== null)
        line.push({ time: d.time, value: macdLineRaw[i] as number });
      if (macdLineRaw[i] !== null && signalLineRaw[i] !== null) {
        signal.push({ time: d.time, value: signalLineRaw[i] as number });
        hist.push({
          time: d.time,
          value: histogramRaw[i] as number,
          color:
            (histogramRaw[i] as number) >= 0
              ? "rgba(38, 166, 154, 0.5)"
              : "rgba(239, 83, 80, 0.5)",
        });
      }
    });
    return { data: { line, signal, hist }, status };
  }, [closePrices, processedData]);

  // autoScale: 차트 기본 동작에 완전히 맡김 (건드리지 않음)
  // 종목 변경, WebSocket 갱신 모두 차트 라이브러리가 자동 처리

  useEffect(() => {
    const charts = [mainChart, pivotChart, rsiChart, macdChart].filter(
      (c): c is IChartApi => c !== null,
    );

    if (charts.length < 2) return;

    let isSyncing = false;

    const syncHandlers = charts.map((sourceChart) => {
      const handler = (logicalRange: LogicalRange | null) => {
        if (!logicalRange || isSyncing) return;

        isSyncing = true;
        charts.forEach((targetChart) => {
          if (targetChart !== sourceChart) {
            if (isMovingToDate.current && targetChart === mainChart) {
              return;
            }
            targetChart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        });
        isSyncing = false;
      };

      sourceChart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return { sourceChart, handler };
    });

    return () => {
      syncHandlers.forEach(({ sourceChart, handler }) => {
        sourceChart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      });
    };
  }, [mainChart, pivotChart, rsiChart, macdChart]);

  useEffect(() => {
    if (
      mainChart &&
      processedData.length > 0 &&
      !isInitialZoomApplied.current
    ) {
      isInitialZoomApplied.current = true; // 중복 실행 방지

      // container 렌더 완료 대기 (RAF 2회)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            const container = containerRef.current;
            if (!container) {
              console.warn("[ZOOM] Container not found");
              return;
            }

            const actualWidth = container.clientWidth;
            if (actualWidth < 100) {
              console.warn(`[ZOOM] Container too small: ${actualWidth}px`);
              return;
            }

            // 전역 저장된 zoom 또는 기본값 (모든 타임프레임 공통)
            const savedZoom = globalZoom.current;
            const visibleBars = savedZoom || 80;

            console.log(
              `[ZOOM] Container width: ${actualWidth}px, Applying ${savedZoom ? "saved" : "default"} zoom: ${visibleBars} bars`,
            );

            isApplyingZoom.current = true;
            mainChart.timeScale().setVisibleLogicalRange({
              from: processedData.length - 1 - visibleBars,
              to: processedData.length + 1,
            });

            // 플래그 해제
            setTimeout(() => {
              isApplyingZoom.current = false;
            }, 100);
          } catch (err) {
            console.warn("[ZOOM] Failed to apply initial zoom", err);
          }
        });
      });
    }
  }, [mainChart, timeframe]);

  useImperativeHandle(ref, () => ({
    moveToDate(date: string) {
      if (mainChart && processedData.length > 0) {
        const formattedDate = date.replace(/[ T]/, "\n");
        const idx = processedData.findIndex(
          (d) => d.date === formattedDate || d.date === date,
        );
        if (idx !== -1) {
          const range = mainChart.timeScale().getVisibleLogicalRange();
          if (range) {
            isMovingToDate.current = true;

            mainChart
              .timeScale()
              .scrollToPosition(
                -(processedData.length - 1 - idx) +
                  Math.floor((range.to - range.from) / 2),
                true,
              );

            setTimeout(() => {
              isMovingToDate.current = false;
            }, 1000);
          }
        }
      }
    },
  }));

  const hasData = processedData.length > 0;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-1 w-full flex-1 min-h-0"
    >
      {/* 로딩 중 (데이터 없음): 전체 화면 dim 처리 */}
      {loading && !hasData && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-100/95 dark:bg-slate-900/95 rounded backdrop-blur-sm">
          <div className="w-12 h-12 border-4 border-slate-300 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            차트 데이터 로딩 중...
          </p>
        </div>
      )}

      {/* 로딩 중 (데이터 있음): 갱신 중 표시 */}
      {loading && hasData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 dark:bg-slate-900/30 rounded backdrop-blur-[0.5px]">
          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded shadow-sm">
            갱신 중...
          </span>
        </div>
      )}

      {/* 에러 (데이터 없음) */}
      {error && !hasData && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline ml-2">{error}</span>
          </div>
        </div>
      )}

      {/* 에러 (데이터 있음): 상단 알림 */}
      {error && hasData && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 bg-red-100 border border-red-400 text-red-700 px-4 py-1 rounded shadow text-xs">
          Update Failed: {error}
        </div>
      )}

      {/* 차트 렌더링 (항상) */}
      <div
        className="w-full min-w-0 overflow-hidden flex-shrink-0"
        style={{ height: `${chartHeights.main}px` }}
      >
        {hasData && (
          <MainChart
            data={processedData}
            probLevels={probLevels}
            timeframe={timeframe}
            gridStrokeColor={gridStrokeColor}
            height={chartHeights.main}
            onReady={setMainChart}
          />
        )}
      </div>

      {["1h", "15m"].includes(timeframe) && (
        <div
          className="w-full min-w-0 overflow-hidden flex-shrink-0"
          style={{ height: `${chartHeights.main}px` }}
        >
          {hasData && (
            <PivotChart
              data={processedData}
              timeframe={timeframe}
              gridStrokeColor={gridStrokeColor}
              height={chartHeights.main}
              onReady={setPivotChart}
            />
          )}
        </div>
      )}

      <div
        className="w-full min-w-0 overflow-hidden flex-shrink-0"
        style={{ height: `${chartHeights.sub}px` }}
      >
        {hasData && (
          <RsiChart
            data={processedData}
            gridStrokeColor={gridStrokeColor}
            height={chartHeights.sub}
            onReady={setRsiChart}
          />
        )}
      </div>
      <div
        className="w-full min-w-0 overflow-hidden flex-shrink-0"
        style={{ height: `${chartHeights.sub}px` }}
      >
        {hasData && (
          <MacdChart
            data={processedData}
            macdData={macdResult.data}
            macdStatus={macdResult.status}
            gridStrokeColor={gridStrokeColor}
            height={chartHeights.sub}
            onReady={setMacdChart}
          />
        )}
      </div>
    </div>
  );
});
