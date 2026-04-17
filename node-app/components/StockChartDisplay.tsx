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
  IPriceLine,
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

// Calculate Kaufman's Adaptive Moving Average (KAMA) for MACD Reloaded
const calculateKAMA = (
  data: number[],
  period: number,
  fastEnd = 2,
  slowEnd = 30,
): (number | null)[] => {
  const kama: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return kama;

  const fastest = 2 / (fastEnd + 1);
  const slowest = 2 / (slowEnd + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  kama[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    const change = Math.abs(data[i] - data[i - period]);
    let volatility = 0;
    for (let j = 0; j < period; j++) {
      volatility += Math.abs(data[i - j] - data[i - j - 1]);
    }
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
    kama[i] =
      (kama[i - 1] as number) + sc * (data[i] - (kama[i - 1] as number));
  }
  return kama;
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

    // Reference to hold the probability zone price lines to clean them up on updates
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const macdPriceLineRef = useRef<IPriceLine | null>(null);
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
        color: "#000000",
        lineWidth: 1,
        lineStyle: 1,
      });
      const lowerSeries = mainChart.addSeries(LineSeries, {
        color: "#000000",
        lineWidth: 1,
        lineStyle: 1,
      });

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

      const macdLineSeries = macdChart.addSeries(LineSeries, {
        color: "#2e7d32",
        lineWidth: 2,
      });

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
        priceLinesRef.current = [];
        macdPriceLineRef.current = null;
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

      const closePrices = uniqueValidData.map((d) => Number(d.close));

      // 1. Calculate Reversal Probability Zones (Horizontal Box/Levels)
      // Clean up previous probability lines
      if (seriesRef.current.candle) {
        priceLinesRef.current.forEach((pl) => {
          try {
            seriesRef.current.candle?.removePriceLine(pl);
          } catch {
            // Ignored
          }
        });
        priceLinesRef.current = [];

        // Calculate statistics using up to the last 1000 candles
        const lookbackPeriod = Math.min(1000, closePrices.length);
        if (lookbackPeriod > 10) {
          const recentPrices = closePrices.slice(-lookbackPeriod);
          const mean = recentPrices.reduce((a, b) => a + b, 0) / lookbackPeriod;
          const variance =
            recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
            lookbackPeriod;
          const sd = Math.sqrt(variance);

          // Define Z-Scores for probability thresholds
          const levels = [
            {
              price: mean + 1.645 * sd,
              title: "90%",
              color: "rgba(239, 83, 80, 0.8)",
            },
            {
              price: mean + 1.15 * sd,
              title: "75%",
              color: "rgba(239, 83, 80, 0.6)",
            },
            {
              price: mean + 0.67 * sd,
              title: "50%",
              color: "rgba(239, 83, 80, 0.4)",
            },
            {
              price: mean + 0.32 * sd,
              title: "25%",
              color: "rgba(239, 83, 80, 0.2)",
            },
            {
              price: mean - 0.32 * sd,
              title: "25%",
              color: "rgba(38, 166, 154, 0.2)",
            },
            {
              price: mean - 0.67 * sd,
              title: "50%",
              color: "rgba(38, 166, 154, 0.4)",
            },
            {
              price: mean - 1.15 * sd,
              title: "75%",
              color: "rgba(38, 166, 154, 0.6)",
            },
            {
              price: mean - 1.645 * sd,
              title: "90%",
              color: "rgba(38, 166, 154, 0.8)",
            },
          ];

          levels.forEach((lvl) => {
            try {
              const pl = seriesRef.current.candle?.createPriceLine({
                price: lvl.price,
                color: lvl.color,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: lvl.title,
              });
              if (pl) priceLinesRef.current.push(pl);
            } catch {
              // Ignored
            }
          });
        }
      }

      const rsiData = uniqueValidData
        .filter((d) => typeof d.rsi === "number" && !isNaN(d.rsi))
        .map((d) => ({ time: d.chartTime, value: d.rsi! }));

      // 2. Apply MACD Reloaded (KAMA)
      const fastKAMA = calculateKAMA(closePrices, 12);
      const slowKAMA = calculateKAMA(closePrices, 26);

      const macdLineRaw: (number | null)[] = closePrices.map((_, i) => {
        if (fastKAMA[i] !== null && slowKAMA[i] !== null) {
          return (fastKAMA[i] as number) - (slowKAMA[i] as number);
        }
        return null;
      });

      const signalLineRaw: (number | null)[] = new Array(
        closePrices.length,
      ).fill(null);
      const macdStartIndex = 25;

      if (closePrices.length >= macdStartIndex + 9) {
        let sum = 0;
        for (let i = macdStartIndex; i < macdStartIndex + 9; i++) {
          sum += macdLineRaw[i] as number;
        }
        signalLineRaw[macdStartIndex + 9 - 1] = sum / 9;

        const k = 2 / (9 + 1);
        for (let i = macdStartIndex + 9; i < closePrices.length; i++) {
          signalLineRaw[i] =
            ((macdLineRaw[i] as number) - (signalLineRaw[i - 1] as number)) *
              k +
            (signalLineRaw[i - 1] as number);
        }
      }

      const macdLineData: { time: Time; value: number }[] = [];
      const signalLineData: { time: Time; value: number }[] = [];
      const histogramData: { time: Time; value: number; color: string }[] = [];

      uniqueValidData.forEach((d, i) => {
        const macd = macdLineRaw[i];
        const signal = signalLineRaw[i];

        if (macd !== null) {
          macdLineData.push({ time: d.chartTime, value: macd });
        }
        if (macd !== null && signal !== null) {
          signalLineData.push({ time: d.chartTime, value: signal });
          const hist = macd - signal;
          const color =
            hist >= 0 ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)";
          histogramData.push({ time: d.chartTime, value: hist, color });
        }
      });

      let macdTitle = "MACD";
      let macdColor = "#2e7d32";
      let currMacdVal = 0;
      const lastIdx = closePrices.length - 1;
      const prevIdx = lastIdx - 1;

      if (
        lastIdx > 0 &&
        macdLineRaw[lastIdx] !== null &&
        signalLineRaw[lastIdx] !== null &&
        macdLineRaw[prevIdx] !== null &&
        signalLineRaw[prevIdx] !== null
      ) {
        const currMacd = macdLineRaw[lastIdx] as number;
        currMacdVal = currMacd;
        const currSig = signalLineRaw[lastIdx] as number;
        const prevMacd = macdLineRaw[prevIdx] as number;
        const prevSig = signalLineRaw[prevIdx] as number;

        if (prevMacd <= prevSig && currMacd > currSig) {
          macdTitle = "골드";
          macdColor = "#2e7d32";
        } else if (prevMacd >= prevSig && currMacd < currSig) {
          macdTitle = "데드";
          macdColor = "#ef5350";
        } else if (currMacd > currSig) {
          macdTitle = "상승";
          macdColor = "#2e7d32";
        } else if (currMacd < currSig) {
          macdTitle = "하락";
          macdColor = "#ef5350";
        }
      }

      if (seriesRef.current.macdLine) {
        seriesRef.current.macdLine.applyOptions({
          title: macdTitle,
          color: macdColor,
        });

        if (macdPriceLineRef.current) {
          try {
            seriesRef.current.macdLine.removePriceLine(
              macdPriceLineRef.current,
            );
          } catch {
            // Ignored
          }
          macdPriceLineRef.current = null;
        }

        if (currMacdVal !== 0) {
          try {
            macdPriceLineRef.current =
              seriesRef.current.macdLine.createPriceLine({
                price: currMacdVal,
                color: macdColor,
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: macdTitle,
              });
          } catch {
            // Ignored
          }
        }
      }

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
        console.error("Failed to update series data", err);
      }

      if (!isInitialZoomApplied.current && uniqueValidData.length > 0) {
        const screenWidth = window.innerWidth;
        let visibleBarsCount = 55;

        if (screenWidth >= 1024) {
          visibleBarsCount = 150;
        } else if (screenWidth >= 768) {
          visibleBarsCount = 80;
        }

        const lastIndex = uniqueValidData.length - 1;

        try {
          chartRef.current.main.timeScale().setVisibleLogicalRange({
            from: lastIndex - visibleBarsCount,
            to: lastIndex + 2,
          });
          isInitialZoomApplied.current = true;
        } catch (err) {
          console.error("Failed to set logical range", err);
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
