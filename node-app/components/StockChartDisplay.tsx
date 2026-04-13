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
  HistogramSeries,
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

// EMA(지수이동평균) 계산 헬퍼 함수
const calculateEMA = (data: number[], period: number) => {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
};

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
    const macdChartContainerRef = useRef<HTMLDivElement>(null);

    const chartRef = useRef<{
      main: IChartApi | null;
      rsi: IChartApi | null;
      macd: IChartApi | null;
    }>({
      main: null,
      rsi: null,
      macd: null,
    });

    const seriesRef = useRef<{
      candle: ISeriesApi<"Candlestick"> | null;
      upper: ISeriesApi<"Line"> | null;
      lower: ISeriesApi<"Line"> | null;
      rsi: ISeriesApi<"Line"> | null;
      macdHist: ISeriesApi<"Histogram"> | null;
      macdLine: ISeriesApi<"Line"> | null;
      macdSignal: ISeriesApi<"Line"> | null;
      dummy: ISeriesApi<"Candlestick"> | null;
      macdDummy: ISeriesApi<"Candlestick"> | null;
    }>({
      candle: null,
      upper: null,
      lower: null,
      rsi: null,
      macdHist: null,
      macdLine: null,
      macdSignal: null,
      dummy: null,
      macdDummy: null,
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

    // --- EFFECT 1: Initialize Charts & Series ---
    useEffect(() => {
      if (
        !chartContainerRef.current ||
        !rsiChartContainerRef.current ||
        !macdChartContainerRef.current
      )
        return;

      const isPcScreen = window.innerWidth >= 1024;
      const mainChartHeight = isPcScreen ? 400 : 250;
      const subChartHeight = isPcScreen ? 120 : 100;

      chartContainerRef.current.style.height = `${mainChartHeight}px`;
      rsiChartContainerRef.current.style.height = `${subChartHeight}px`;
      macdChartContainerRef.current.style.height = `${subChartHeight}px`;

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
        height: subChartHeight,
        timeScale: { visible: false },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      });

      const macdChart = createChart(macdChartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: gridStrokeColor,
        },
        grid: {
          vertLines: { color: "rgba(70, 130, 180, 0.1)" },
          horzLines: { color: "rgba(70, 130, 180, 0.1)" },
        },
        width: macdChartContainerRef.current.clientWidth,
        height: subChartHeight,
        timeScale: { visible: false },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = { main: mainChart, rsi: rsiChart, macd: macdChart };

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

      // 💡 RSI 라인: 진한 초록색으로 변경
      const rsiLineSeries = rsiChart.addSeries(LineSeries, {
        color: "#2e7d32",
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

      const macdHistSeries = macdChart.addSeries(HistogramSeries, {
        color: "#26a69a",
      });

      // 💡 MACD 라인: 진한 초록색으로 변경
      const macdLineSeries = macdChart.addSeries(LineSeries, {
        color: "#2e7d32",
        lineWidth: 2,
      });

      // 💡 Signal 라인: 진한 회색으로 변경
      const macdSignalSeries = macdChart.addSeries(LineSeries, {
        color: "#555555",
        lineWidth: 2,
      });

      const macdDummySeries = macdChart.addSeries(CandlestickSeries, {
        visible: false,
      });

      seriesRef.current = {
        candle: candleSeries,
        upper: upperSeries,
        lower: lowerSeries,
        rsi: rsiLineSeries,
        macdHist: macdHistSeries,
        macdLine: macdLineSeries,
        macdSignal: macdSignalSeries,
        dummy: dummySeries,
        macdDummy: macdDummySeries,
      };

      mainChart
        .timeScale()
        .subscribeVisibleLogicalRangeChange(
          (logicalRange: LogicalRange | null) => {
            if (logicalRange) {
              rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
              macdChart.timeScale().setVisibleLogicalRange(logicalRange);
            }
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
        if (macdChartContainerRef.current)
          macdChart.applyOptions({
            width: macdChartContainerRef.current.clientWidth,
          });
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        mainChart.remove();
        rsiChart.remove();
        macdChart.remove();
        chartRef.current = { main: null, rsi: null, macd: null };
        seriesRef.current = {
          candle: null,
          upper: null,
          lower: null,
          rsi: null,
          macdHist: null,
          macdLine: null,
          macdSignal: null,
          dummy: null,
          macdDummy: null,
        };
      };
    }, [gridStrokeColor, timeframe]);

    // --- EFFECT 2: Update Data ---
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

      const closePrices = uniqueValidData.map((d) => Number(d.close));
      const ema12 = calculateEMA(closePrices, 12);
      const ema26 = calculateEMA(closePrices, 26);

      const macdLineRaw = closePrices.map((_, i) => ema12[i] - ema26[i]);
      const signalLineRaw = calculateEMA(macdLineRaw, 9);
      const histogramRaw = macdLineRaw.map(
        (macd, i) => macd - signalLineRaw[i],
      );

      const macdLineData = uniqueValidData.map((d, i) => ({
        time: d.chartTime,
        value: macdLineRaw[i],
      }));
      const signalLineData = uniqueValidData.map((d, i) => ({
        time: d.chartTime,
        value: signalLineRaw[i],
      }));
      const histogramData = uniqueValidData.map((d, i) => {
        const val = histogramRaw[i];
        const color =
          val >= 0 ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)";
        return { time: d.chartTime, value: val, color };
      });

      try {
        seriesRef.current.candle.setData(candlestickChartData);
        seriesRef.current.upper?.setData(upperData);
        seriesRef.current.lower?.setData(lowerData);
        seriesRef.current.rsi?.setData(rsiData);
        seriesRef.current.dummy?.setData(candlestickChartData);

        seriesRef.current.macdLine?.setData(macdLineData);
        seriesRef.current.macdSignal?.setData(signalLineData);
        seriesRef.current.macdHist?.setData(histogramData);
        seriesRef.current.macdDummy?.setData(candlestickChartData);
      } catch (err) {
        console.error("[CHART ERROR] Failed to update series data:", err);
      }

      if (!isInitialZoomApplied.current && uniqueValidData.length > 0) {
        const screenWidth = window.innerWidth;
        // 💡 모바일 화면에서 한 번에 보이는 캔들 수를 75개 -> 45개로 줄임 (봉이 더 굵고 큼직하게 보임)
        let visibleBarsCount = 55;

        if (screenWidth >= 1024) {
          visibleBarsCount = 150; // PC는 넓으므로 150개 유지
        } else if (screenWidth >= 768) {
          visibleBarsCount = 80; // 태블릿은 100개 -> 80개로 약간 조정
        }

        const lastIndex = uniqueValidData.length - 1;

        try {
          chartRef.current.main.timeScale().setVisibleLogicalRange({
            from: lastIndex - visibleBarsCount,
            to: lastIndex + 2, // 오른쪽 여백을 위해 +2
          });
          isInitialZoomApplied.current = true;
        } catch (err) {
          console.error("[CHART ERROR] Failed to set logical range:", err);
        }
      }
    }, [data, signals, timeframe]);

    const hasData = Array.isArray(data) && data.length > 0;

    return (
      <div className="relative flex flex-col gap-1 w-full min-h-[450px]">
        {loading && !hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white dark:bg-slate-900 rounded">
            <p className="text-slate-700 dark:text-slate-300 font-medium">
              데이터 로딩 중...
            </p>
          </div>
        )}

        {loading && hasData && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 dark:bg-slate-900/30 rounded backdrop-blur-[0.5px]">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded shadow-sm">
              데이터 갱신 중...
            </span>
          </div>
        )}

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

        {error && hasData && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 bg-red-100 border border-red-400 text-red-700 px-4 py-1 rounded shadow text-xs">
            갱신 실패: {error}
          </div>
        )}

        <div ref={chartContainerRef} style={{ width: "100%" }} />
        <div ref={rsiChartContainerRef} style={{ width: "100%" }} />
        <div ref={macdChartContainerRef} style={{ width: "100%" }} />
      </div>
    );
  },
);

StockChartDisplay.displayName = "StockChartDisplay";
