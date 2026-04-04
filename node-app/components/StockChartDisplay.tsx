/* components/StockChartDisplay.tsx */

"use client";

import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { StockDataPoint, TradingSignal } from "@/lib/stockUtils";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  CandlestickData,
  Time,
  CrosshairMode,
  LogicalRange,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";

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

export const StockChartDisplay = forwardRef<
  StockChartDisplayHandles,
  StockChartDisplayProps
>(
  (
    { data, signals, gridStrokeColor, loading, error, timeframe = "1d" },
    ref,
  ) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const rsiChartContainerRef = useRef<HTMLDivElement>(null);

    const chartRef = useRef<{ main: IChartApi | null; rsi: IChartApi | null }>({
      main: null,
      rsi: null,
    });

    const seriesRef = useRef<{
      candle: ISeriesApi<"Candlestick"> | null;
      upper: ISeriesApi<"Line"> | null;
      lower: ISeriesApi<"Line"> | null;
      rsi: ISeriesApi<"Line"> | null;
      dummy: ISeriesApi<"Candlestick"> | null;
    }>({
      candle: null,
      upper: null,
      lower: null,
      rsi: null,
      dummy: null,
    });

    const isInitialZoomApplied = useRef(false);

    useEffect(() => {
      isInitialZoomApplied.current = false;
    }, [timeframe]);

    useImperativeHandle(ref, () => ({
      moveToDate(date: string) {
        if (chartRef.current.main && data && data.length > 0) {
          const targetIndex = data.findIndex((d) => d.date === date);

          if (targetIndex !== -1) {
            const logicalRange = chartRef.current.main
              .timeScale()
              .getVisibleLogicalRange();
            if (logicalRange) {
              const lastIndex = data.length - 1;
              const barsVisible = logicalRange.to - logicalRange.from;
              const positionFromRight = -(lastIndex - targetIndex);
              const finalPosition =
                positionFromRight + Math.floor(barsVisible / 2);
              chartRef.current.main
                .timeScale()
                .scrollToPosition(finalPosition, true);
            }
          }
        }
      },
    }));

    // --- EFFECT 1: Initialize Charts & Series (Always runs and keeps DOM nodes stable) ---
    useEffect(() => {
      if (!chartContainerRef.current || !rsiChartContainerRef.current) return;

      const isPcScreen = window.innerWidth >= 1024;
      const mainChartHeight = isPcScreen ? 400 : 250;
      const rsiChartHeight = isPcScreen ? 120 : 100;

      chartContainerRef.current.style.height = `${mainChartHeight}px`;
      rsiChartContainerRef.current.style.height = `${rsiChartHeight}px`;

      const mainChart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: gridStrokeColor,
        },
        grid: {
          vertLines: { color: "rgba(70, 130, 180, 0.1)" },
          horzLines: { color: "rgba(70, 130, 180, 0.1)" },
        },
        width: chartContainerRef.current.clientWidth,
        height: mainChartHeight,
        timeScale: {
          timeVisible: timeframe !== "1d",
          secondsVisible: false,
          rightBarStaysOnScroll: false,
          shiftVisibleRangeOnNewBar: true,
        },
        crosshair: { mode: CrosshairMode.Normal },
        localization: {
          locale: "ko-KR",
          timeFormatter: (time: Time) => {
            if (timeframe === "1d") {
              return new Date(time as string).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
            } else {
              const dateObj = new Date((time as number) * 1000);
              return dateObj.toLocaleString("ko-KR", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
            }
          },
        },
      });

      const rsiChart = createChart(rsiChartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: gridStrokeColor,
        },
        grid: {
          vertLines: { color: "rgba(70, 130, 180, 0.1)" },
          horzLines: { color: "rgba(70, 130, 180, 0.1)" },
        },
        width: rsiChartContainerRef.current.clientWidth,
        height: rsiChartHeight,
        timeScale: { visible: false },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = { main: mainChart, rsi: rsiChart };

      const candleSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: "#E53935",
        downColor: "#1E88E5",
        borderUpColor: "black",
        borderDownColor: "black",
        wickUpColor: "#E53935",
        wickDownColor: "#1E88E5",
      });

      const upperSeries = mainChart.addSeries(LineSeries, {
        color: "#ccc",
        lineWidth: 1,
        lineStyle: 2,
      });
      const lowerSeries = mainChart.addSeries(LineSeries, {
        color: "#ccc",
        lineWidth: 1,
        lineStyle: 2,
      });

      const rsiLineSeries = rsiChart.addSeries(LineSeries, {
        color: "#82ca9d",
        lineWidth: 2,
      });

      rsiLineSeries.createPriceLine({
        price: 70,
        color: "red",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "과매수",
      });
      rsiLineSeries.createPriceLine({
        price: 30,
        color: "green",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "과매도",
      });

      const dummySeries = rsiChart.addSeries(CandlestickSeries, {
        visible: false,
      });

      seriesRef.current = {
        candle: candleSeries,
        upper: upperSeries,
        lower: lowerSeries,
        rsi: rsiLineSeries,
        dummy: dummySeries,
      };

      mainChart
        .timeScale()
        .subscribeVisibleLogicalRangeChange(
          (logicalRange: LogicalRange | null) => {
            if (logicalRange)
              rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
          },
        );

      const handleResize = () => {
        if (chartContainerRef.current)
          mainChart.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        if (rsiChartContainerRef.current)
          rsiChart.applyOptions({
            width: rsiChartContainerRef.current.clientWidth,
          });
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        mainChart.remove();
        rsiChart.remove();
        chartRef.current = { main: null, rsi: null };
        seriesRef.current = {
          candle: null,
          upper: null,
          lower: null,
          rsi: null,
          dummy: null,
        };
      };
    }, [gridStrokeColor, timeframe]);

    // --- EFFECT 2: Update Data (Safe against empty data and rapid refreshes) ---
    useEffect(() => {
      if (
        !data ||
        data.length === 0 ||
        !seriesRef.current.candle ||
        !chartRef.current.main
      ) {
        return;
      }

      const formatTimeForChart = (dateString: string): Time => {
        if (timeframe === "1d") {
          return dateString.split("T")[0].split(" ")[0] as Time;
        } else {
          const safeDateStr = dateString.includes(" ")
            ? dateString.replace(" ", "T")
            : dateString;
          const dateObj = new Date(safeDateStr);
          const timestamp = Math.floor(dateObj.getTime() / 1000);

          return isNaN(timestamp) ? (0 as Time) : (timestamp as Time);
        }
      };

      const cleanData = data
        .filter((d) => d && d.date)
        .map((d) => ({ ...d, chartTime: formatTimeForChart(d.date) }))
        .filter((d) => d.chartTime !== 0);

      cleanData.sort((a, b) => {
        if (typeof a.chartTime === "number" && typeof b.chartTime === "number")
          return a.chartTime - b.chartTime;
        if (typeof a.chartTime === "string" && typeof b.chartTime === "string")
          return (
            new Date(a.chartTime).getTime() - new Date(b.chartTime).getTime()
          );
        return 0;
      });

      const uniqueValidData = cleanData.filter(
        (v, i, a) => a.findIndex((t) => t.chartTime === v.chartTime) === i,
      );

      if (uniqueValidData.length === 0) return;

      const candlestickChartData: CandlestickData[] = uniqueValidData.map(
        (d) => {
          let color: string | undefined = undefined;
          const buySignalPeriod = signals.find(
            (s) =>
              s.startDate &&
              s.date &&
              d.date >= s.startDate &&
              d.date <= s.date &&
              s.type.includes("buy"),
          );
          const sellSignalDay = signals.find(
            (s) => s.date === d.date && s.type === "sell",
          );
          if (buySignalPeriod || sellSignalDay) color = "#FFEB3B";

          return {
            time: d.chartTime,
            open: Number(d.open),
            high: Number(d.high),
            low: Number(d.low),
            close: Number(d.close),
            color: color,
          } as CandlestickData;
        },
      );

      const upperData = uniqueValidData
        .filter(
          (d) =>
            d.bollingerBands &&
            typeof d.bollingerBands.upper === "number" &&
            !isNaN(d.bollingerBands.upper),
        )
        .map((d) => ({ time: d.chartTime, value: d.bollingerBands!.upper }));

      const lowerData = uniqueValidData
        .filter(
          (d) =>
            d.bollingerBands &&
            typeof d.bollingerBands.lower === "number" &&
            !isNaN(d.bollingerBands.lower),
        )
        .map((d) => ({ time: d.chartTime, value: d.bollingerBands!.lower }));

      const rsiData = uniqueValidData
        .filter((d) => typeof d.rsi === "number" && !isNaN(d.rsi))
        .map((d) => ({ time: d.chartTime, value: d.rsi! }));

      try {
        seriesRef.current.candle.setData(candlestickChartData);
        seriesRef.current.upper?.setData(upperData);
        seriesRef.current.lower?.setData(lowerData);
        seriesRef.current.rsi?.setData(rsiData);
        seriesRef.current.dummy?.setData(candlestickChartData);
      } catch (err) {
        console.error("[CHART ERROR] Failed to update series data:", err);
      }

      if (!isInitialZoomApplied.current && uniqueValidData.length > 0) {
        const screenWidth = window.innerWidth;
        let visibleBarsCount = 75; // Mobile (default)
        if (screenWidth >= 1024)
          visibleBarsCount = 150; // PC
        else if (screenWidth >= 768) visibleBarsCount = 100; // Tablet

        const lastIndex = uniqueValidData.length - 1;

        try {
          chartRef.current.main.timeScale().setVisibleLogicalRange({
            from: lastIndex - visibleBarsCount,
            to: lastIndex + 2,
          });
          isInitialZoomApplied.current = true;
        } catch (err) {
          console.error("[CHART ERROR] Failed to set logical range:", err);
        }
      }
    }, [data, signals, timeframe]);

    const hasData = Array.isArray(data) && data.length > 0;

    return (
      <div className="relative flex flex-col gap-1 w-full min-h-[350px]">
        {/* Initial loading screen (when data is completely empty) overlaying the chart area */}
        {loading && !hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
            <p className="text-slate-700 dark:text-slate-300 font-medium">
              데이터 로딩 중...
            </p>
          </div>
        )}

        {/* Background/Manual refresh overlay (when data exists but we are fetching updates) */}
        {loading && hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 dark:bg-slate-900/30 rounded backdrop-blur-[0.5px]">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded shadow-sm">
              데이터 갱신 중...
            </span>
          </div>
        )}

        {/* Error overlay on initial load */}
        {error && !hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
              role="alert"
            >
              <strong className="font-bold">Error:</strong>
              <span className="block sm:inline ml-2">{error}</span>
            </div>
          </div>
        )}

        {/* Non-intrusive error alert on background refresh */}
        {error && hasData && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 bg-red-100 border border-red-400 text-red-700 px-4 py-1 rounded shadow text-xs">
            갱신 실패: {error}
          </div>
        )}

        {/* Chart DOM nodes are ALWAYS rendered. They will simply be empty until data arrives. */}
        <div ref={chartContainerRef} style={{ width: "100%" }} />
        <div ref={rsiChartContainerRef} style={{ width: "100%" }} />
      </div>
    );
  },
);

StockChartDisplay.displayName = "StockChartDisplay";
