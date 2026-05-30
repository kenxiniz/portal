/* components/charts/MainChart.tsx */
"use client";

import React, { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  Time,
  CandlestickData,
} from "lightweight-charts";
import { ProcessedChartData } from "../StockChartDisplay";
import { calculateGaussianTrendBoxes } from "@/lib/charts/indicators";
import { GaussianBoxPrimitive } from "./plugins/GaussianBoxPrimitive";

interface MainChartProps {
  data: ProcessedChartData[];
  probLevels: { price: number; title: string; color: string }[];
  timeframe: string;
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
  initialVisibleBars?: number;
}

type ExtendedChartData = ProcessedChartData & {
  vwap?: number;
  ema9?: number;
  ema20?: number;
};

export const MainChart: React.FC<MainChartProps> = ({
  data,
  probLevels,
  timeframe,
  gridStrokeColor,
  height,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<{
    candle: ISeriesApi<"Candlestick"> | null;
    upper: ISeriesApi<"Line"> | null;
    lower: ISeriesApi<"Line"> | null;
    vwap: ISeriesApi<"Line"> | null;
    ema9: ISeriesApi<"Line"> | null;
    ema20: ISeriesApi<"Line"> | null;
  }>({
    candle: null,
    upper: null,
    lower: null,
    vwap: null,
    ema9: null,
    ema20: null,
  });

  const priceLinesRef = useRef<IPriceLine[]>([]);
  const boxPrimitiveRef = useRef<GaussianBoxPrimitive | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: gridStrokeColor,
      },
      grid: {
        vertLines: { color: "rgba(70, 130, 180, 0.1)" },
        horzLines: { color: "rgba(70, 130, 180, 0.1)" },
      },
      width: containerRef.current.clientWidth,
      height,
      timeScale: {
        timeVisible: timeframe !== "1d",
        secondsVisible: false,
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
            return new Date((time as number) * 1000).toLocaleString("ko-KR", {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#E53935",
      downColor: "#1E88E5",
      borderUpColor: "black",
      borderDownColor: "black",
      wickUpColor: "#E53935",
      wickDownColor: "#1E88E5",
    });

    const boxPrimitive = new GaussianBoxPrimitive([]);
    candleSeries.attachPrimitive(boxPrimitive);
    boxPrimitiveRef.current = boxPrimitive;

    const upperSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false, // 💡 점선 제거 (Tag만 유지)
    });
    const lowerSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false, // 💡 점선 제거 (Tag만 유지)
    });

    // 1. VWAP Series (Yellow)
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "rgba(255, 235, 59, 1)",
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 점선 제거 (Tag만 유지)
    });

    // 2. 9 EMA Series (White, Dashed)
    const ema9Series = chart.addSeries(LineSeries, {
      color: "rgba(255, 255, 255, 0.8)",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 점선 제거 (Tag만 유지)
    });

    // 3. 20 EMA Series (Blue)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "rgba(33, 150, 243, 0.8)",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 점선 제거 (Tag만 유지)
    });

    chartRef.current = chart;
    seriesRef.current = {
      candle: candleSeries,
      upper: upperSeries,
      lower: lowerSeries,
      vwap: vwapSeries,
      ema9: ema9Series,
      ema20: ema20Series,
    };
    onReady(chart);

    const handleResize = () =>
      chart.applyOptions({ width: containerRef.current?.clientWidth || 0 });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStrokeColor, timeframe, onReady]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  useEffect(() => {
    if (!data.length || !seriesRef.current.candle) return;

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: d.color,
    }));

    seriesRef.current.candle.setData(candleData);

    const boxes = calculateGaussianTrendBoxes(data, 20, 3);
    if (boxPrimitiveRef.current) {
      boxPrimitiveRef.current.setData(boxes);
    }

    const upData = data
      .filter((d) => d.upper !== undefined)
      .map((d) => ({ time: d.time, value: d.upper! }));
    const dnData = data
      .filter((d) => d.lower !== undefined)
      .map((d) => ({ time: d.time, value: d.lower! }));
    seriesRef.current.upper?.setData(upData);
    seriesRef.current.lower?.setData(dnData);

    const extData = data as ExtendedChartData[];

    // Ensure robust filtering against null, undefined, and NaN values
    const vwapData = extData
      .filter((d) => d.vwap !== undefined && d.vwap !== null && !isNaN(d.vwap))
      .map((d) => ({ time: d.time, value: d.vwap! }));

    const ema9Data = extData
      .filter((d) => d.ema9 !== undefined && d.ema9 !== null && !isNaN(d.ema9))
      .map((d) => ({ time: d.time, value: d.ema9! }));

    const ema20Data = extData
      .filter(
        (d) => d.ema20 !== undefined && d.ema20 !== null && !isNaN(d.ema20),
      )
      .map((d) => ({ time: d.time, value: d.ema20! }));

    seriesRef.current.vwap?.setData(vwapData);
    seriesRef.current.ema9?.setData(ema9Data);
    seriesRef.current.ema20?.setData(ema20Data);

    priceLinesRef.current.forEach((pl) => {
      try {
        seriesRef.current.candle?.removePriceLine(pl);
      } catch {}
    });
    priceLinesRef.current = [];

    probLevels.forEach((lvl) => {
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
      } catch {}
    });
  }, [data, probLevels, timeframe]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
};
