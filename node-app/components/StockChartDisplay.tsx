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

    useEffect(() => {
      if (
        loading ||
        !Array.isArray(data) ||
        data.length === 0 ||
        !chartContainerRef.current ||
        !rsiChartContainerRef.current
      ) {
        return;
      }

      const isPcScreen = window.innerWidth >= 1024;
      const mainChartHeight = isPcScreen ? 400 : 250;
      const rsiChartHeight = isPcScreen ? 120 : 100;

      chartContainerRef.current.style.height = `${mainChartHeight}px`;
      rsiChartContainerRef.current.style.height = `${rsiChartHeight}px`;

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

      if (uniqueValidData.length === 0) {
        console.warn(
          "[CHART WARNING] No valid data points available for rendering.",
        );
        return;
      }

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

      const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
        upColor: "#E53935",
        downColor: "#1E88E5",
        borderUpColor: "black",
        borderDownColor: "black",
        wickUpColor: "#E53935",
        wickDownColor: "#1E88E5",
      });

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

      try {
        candlestickSeries.setData(candlestickChartData);
      } catch (err) {
        console.error("[CHART ERROR] Failed to set candlestick data:", err);
      }

      const upperBandSeries = mainChart.addSeries(LineSeries, {
        color: "#ccc",
        lineWidth: 1,
        lineStyle: 2,
      });
      const lowerBandSeries = mainChart.addSeries(LineSeries, {
        color: "#ccc",
        lineWidth: 1,
        lineStyle: 2,
      });

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

      try {
        upperBandSeries.setData(upperData);
        lowerBandSeries.setData(lowerData);
      } catch (err) {
        console.error("[CHART ERROR] Failed to set bollinger bands data:", err);
      }

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: "#82ca9d",
        lineWidth: 2,
      });

      const rsiData = uniqueValidData
        .filter((d) => typeof d.rsi === "number" && !isNaN(d.rsi))
        .map((d) => ({ time: d.chartTime, value: d.rsi! }));

      try {
        rsiSeries.setData(rsiData);
        rsiSeries.createPriceLine({
          price: 70,
          color: "red",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "과매수",
        });
        rsiSeries.createPriceLine({
          price: 30,
          color: "green",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "과매도",
        });
      } catch (err) {
        console.error("[CHART ERROR] Failed to set RSI data:", err);
      }

      const dummySyncSeries = rsiChart.addSeries(CandlestickSeries, {
        visible: false,
      });
      try {
        dummySyncSeries.setData(candlestickChartData);
      } catch (err) {
        console.error("[CHART ERROR] Failed to set dummy sync data:", err);
      }

      if (uniqueValidData.length > 1) {
        const lastDataPoint = uniqueValidData[uniqueValidData.length - 1];
        const screenWidth = window.innerWidth;

        // [MODIFIED] Applied requested bar counts for each screen size
        let visibleBarsCount = 75; // Mobile (default)
        if (screenWidth >= 1024)
          visibleBarsCount = 150; // PC (1024px+)
        else if (screenWidth >= 768) visibleBarsCount = 100; // Tablet (768px+)

        const startIndex = Math.max(
          0,
          uniqueValidData.length - visibleBarsCount,
        );
        const firstDataPoint = uniqueValidData[startIndex];

        try {
          mainChart.timeScale().setVisibleRange({
            from: firstDataPoint.chartTime,
            to: lastDataPoint.chartTime,
          });
        } catch (err) {
          console.error("[CHART ERROR] Failed to set visible range:", err);
        }
      }

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
        if (chartRef.current.main) chartRef.current.main.remove();
        if (chartRef.current.rsi) chartRef.current.rsi.remove();
      };
    }, [data, signals, gridStrokeColor, loading, error, timeframe]);

    if (loading)
      return (
        <p className="text-slate-700 dark:text-slate-300">데이터 로딩 중...</p>
      );
    if (error)
      return (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      );

    return (
      <div className="flex flex-col gap-1">
        <div ref={chartContainerRef} style={{ width: "100%" }} />
        <div ref={rsiChartContainerRef} style={{ width: "100%" }} />
      </div>
    );
  },
);

StockChartDisplay.displayName = "StockChartDisplay";
