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
  }>({ candle: null, upper: null, lower: null });

  const priceLinesRef = useRef<IPriceLine[]>([]);

  // Ref to hold primitive instance
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

    // Initialize and attach Gaussian primitive
    const boxPrimitive = new GaussianBoxPrimitive([]);
    candleSeries.attachPrimitive(boxPrimitive);
    boxPrimitiveRef.current = boxPrimitive;

    // 타임프레임 상관없이 항상 볼린저 밴드 라인 생성
    const upperSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
    });
    const lowerSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
    });

    chartRef.current = chart;
    seriesRef.current = {
      candle: candleSeries,
      upper: upperSeries,
      lower: lowerSeries,
    };
    onReady(chart);

    const handleResize = () =>
      chart.applyOptions({ width: containerRef.current?.clientWidth || 0 });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
    // Intentionally omitting 'height' to prevent chart destruction on resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStrokeColor, timeframe, onReady]);

  // Apply height changes seamlessly without destroying the chart
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

    // Calculate and update Gaussian boxes for primitive rendering
    const boxes = calculateGaussianTrendBoxes(data, 20, 3);
    if (boxPrimitiveRef.current) {
      boxPrimitiveRef.current.setData(boxes);
    }

    // 타임프레임 상관없이 볼린저밴드와 프로빌러티 모두 그리도록 로직 복구
    const upData = data
      .filter((d) => d.upper !== undefined)
      .map((d) => ({ time: d.time, value: d.upper! }));
    const dnData = data
      .filter((d) => d.lower !== undefined)
      .map((d) => ({ time: d.time, value: d.lower! }));
    seriesRef.current.upper?.setData(upData);
    seriesRef.current.lower?.setData(dnData);

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
