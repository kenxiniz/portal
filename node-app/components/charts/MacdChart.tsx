"use client";

import React, { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  HistogramSeries,
  CandlestickSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineData,
  HistogramData,
  CandlestickData,
} from "lightweight-charts";
import { ProcessedChartData } from "../StockChartDisplay";

interface MacdChartProps {
  data: ProcessedChartData[];
  macdStatus: { title: string; color: string; value: number };
  macdData: { line: LineData[]; signal: LineData[]; hist: HistogramData[] };
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
}

export const MacdChart: React.FC<MacdChartProps> = ({
  data,
  macdStatus,
  macdData,
  gridStrokeColor,
  height,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Add chartRef to safely handle dynamic resize without re-rendering chart
  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<{
    line: ISeriesApi<"Line"> | null;
    signal: ISeriesApi<"Line"> | null;
    hist: ISeriesApi<"Histogram"> | null;
    dummy: ISeriesApi<"Candlestick"> | null;
  }>({
    line: null,
    signal: null,
    hist: null,
    dummy: null,
  });

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
      timeScale: { visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const hist = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const line = chart.addSeries(LineSeries, {
      color: "#2e7d32",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    const signal = chart.addSeries(LineSeries, {
      color: "#555555",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const dummy = chart.addSeries(CandlestickSeries, { visible: false });

    seriesRef.current = { line, signal, hist, dummy };
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
  }, [gridStrokeColor, onReady]);

  // Handle dynamic height changes smoothly
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  useEffect(() => {
    if (!data.length || !seriesRef.current.line) return;

    const dummyData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: d.color,
    }));

    try {
      seriesRef.current.line.setData(macdData.line);
      seriesRef.current.signal?.setData(macdData.signal);
      seriesRef.current.hist?.setData(macdData.hist);
      seriesRef.current.dummy?.setData(dummyData);

      // 💡 텍스트를 제거하고 우측 이동 태그에 수치만 소수점 둘째 자리까지 표시하도록 변경했습니다.
      seriesRef.current.line.applyOptions({
        color: macdStatus.color,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => price.toFixed(2),
        },
      });
    } catch (err) {
      console.error("Failed to update MACD series", err);
    }
  }, [data, macdData, macdStatus]);

  return (
    <div className="relative w-full">
      {macdStatus && (
        <div
          className="absolute top-2 left-2 z-10 px-2 py-0.5 text-xs font-semibold rounded text-white shadow-sm pointer-events-none"
          style={{ backgroundColor: macdStatus.color }}
        >
          적응형 모멘텀 {macdStatus.title}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%" }} />
    </div>
  );
};
