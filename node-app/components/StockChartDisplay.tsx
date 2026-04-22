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

export const StockChartDisplay = forwardRef<
  StockChartDisplayHandles,
  StockChartDisplayProps
>(
  (
    { data, signals, gridStrokeColor, loading, error, timeframe = "1d" },
    ref,
  ) => {
    const [mainChart, setMainChart] = useState<IChartApi | null>(null);
    const [rsiChart, setRsiChart] = useState<IChartApi | null>(null);
    const [macdChart, setMacdChart] = useState<IChartApi | null>(null);

    const [chartHeights, setChartHeights] = useState({ main: 250, sub: 100 });
    const isInitialZoomApplied = useRef(false);

    useEffect(() => {
      isInitialZoomApplied.current = false;
    }, [timeframe]);

    useEffect(() => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setChartHeights({ main: 400, sub: 120 });
      } else if (width >= 768) {
        setChartHeights({ main: 300, sub: 110 });
      } else {
        setChartHeights({ main: 250, sub: 100 });
      }
    }, []);

    const { processedData, closePrices } = useMemo(() => {
      if (!data || data.length === 0)
        return { processedData: [], closePrices: [] };

      const formatTime = (dStr: string): Time => {
        if (timeframe === "1d") return dStr.split("T")[0].split(" ")[0] as Time;
        const ts = Math.floor(
          new Date(dStr.replace(" ", "T")).getTime() / 1000,
        );
        return isNaN(ts) ? (0 as Time) : (ts as Time);
      };

      const cleanData = data
        .filter((d) => d?.date)
        .map((d) => ({ ...d, chartTime: formatTime(d.date) }))
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

      // Calculate indicators locally using pure data
      const vwapResults = calculateVWAP(uniqueData, timeframe);
      const ema9Results = calculateEMA(closes, 9);
      const ema20Results = calculateEMA(closes, 20);

      const processed = uniqueData.map((d, i) => {
        const hasSignal = signals.find(
          (s) =>
            (s.startDate &&
              d.date >= s.startDate &&
              d.date <= s.date &&
              s.type.includes("buy")) ||
            (s.date === d.date && s.type === "sell"),
        );

        const extD = d as ExtendedDataPoint;

        return {
          time: d.chartTime,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          color: hasSignal ? "#FFEB3B" : undefined,
          rsi: typeof d.rsi === "number" && !isNaN(d.rsi) ? d.rsi : undefined,
          upper: d.bollingerBands?.upper,
          lower: d.bollingerBands?.lower,

          // Use backend calculated values if available, otherwise use local calculated values
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

          date: d.date,
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

    useEffect(() => {
      if (mainChart && rsiChart && macdChart) {
        const handler = (logicalRange: LogicalRange | null) => {
          if (logicalRange) {
            rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
            macdChart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        };
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        return () =>
          mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      }
    }, [mainChart, rsiChart, macdChart]);

    useEffect(() => {
      if (
        mainChart &&
        processedData.length > 0 &&
        !isInitialZoomApplied.current
      ) {
        const timer = setTimeout(() => {
          try {
            const width = window.innerWidth;
            let visibleBars = 60;

            if (width >= 1024) {
              visibleBars = 150;
            } else if (width >= 768) {
              visibleBars = 100;
            } else {
              visibleBars = 50;
            }

            mainChart.timeScale().setVisibleLogicalRange({
              from: processedData.length - 1 - visibleBars,
              to: processedData.length + 1,
            });
          } catch (err) {
            console.warn("Failed to apply initial zoom", err);
          }
        }, 50);

        isInitialZoomApplied.current = true;
        return () => clearTimeout(timer);
      }
    }, [mainChart, processedData]);

    useImperativeHandle(ref, () => ({
      moveToDate(date: string) {
        if (mainChart && processedData.length > 0) {
          const idx = processedData.findIndex((d) => d.date === date);
          if (idx !== -1) {
            const range = mainChart.timeScale().getVisibleLogicalRange();
            if (range)
              mainChart
                .timeScale()
                .scrollToPosition(
                  -(processedData.length - 1 - idx) +
                    Math.floor((range.to - range.from) / 2),
                  true,
                );
          }
        }
      },
    }));

    const hasData = processedData.length > 0;

    return (
      <div className="relative flex flex-col gap-1 w-full min-h-[450px]">
        {loading && !hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
            <p className="text-slate-700 dark:text-slate-300 font-medium">
              Loading Data...
            </p>
          </div>
        )}
        {loading && hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 dark:bg-slate-900/30 rounded backdrop-blur-[0.5px]">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded shadow-sm">
              Refreshing Data...
            </span>
          </div>
        )}
        {error && !hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
              <strong className="font-bold">Error:</strong>
              <span className="block sm:inline ml-2">{error}</span>
            </div>
          </div>
        )}
        {error && hasData && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 bg-red-100 border border-red-400 text-red-700 px-4 py-1 rounded shadow text-xs">
            Update Failed: {error}
          </div>
        )}

        <MainChart
          data={processedData}
          probLevels={probLevels}
          timeframe={timeframe}
          gridStrokeColor={gridStrokeColor}
          height={chartHeights.main}
          onReady={setMainChart}
        />
        <RsiChart
          data={processedData}
          gridStrokeColor={gridStrokeColor}
          height={chartHeights.sub}
          onReady={setRsiChart}
        />
        <MacdChart
          data={processedData}
          macdData={macdResult.data}
          macdStatus={macdResult.status}
          gridStrokeColor={gridStrokeColor}
          height={chartHeights.sub}
          onReady={setMacdChart}
        />
      </div>
    );
  },
);

StockChartDisplay.displayName = "StockChartDisplay";
