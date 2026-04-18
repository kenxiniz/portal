/* components/charts/MacdChart.tsx */
"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  HistogramSeries,
  CandlestickSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  IPriceLine,
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
  const [chart, setChart] = useState<IChartApi | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
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

    const newChart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: gridStrokeColor,
      },
      grid: {
        vertLines: { color: "rgba(70, 130, 180, 0.1)" },
        horzLines: { color: "rgba(70, 130, 180, 0.1)" },
      },
      width: containerRef.current.clientWidth || 600,
      height,
      timeScale: { visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: false,
      handleScale: false,
    });

    const hist = newChart.addSeries(HistogramSeries, {
      color: "#26a69a",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const line = newChart.addSeries(LineSeries, {
      color: "#2e7d32",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const signal = newChart.addSeries(LineSeries, {
      color: "#555555",
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const dummy = newChart.addSeries(CandlestickSeries, { visible: false });

    seriesRef.current = { line, signal, hist, dummy };
    setChart(newChart);
    onReady(newChart);

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || entries[0].target !== containerRef.current)
        return;
      newChart.applyOptions({ width: entries[0].contentRect.width });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      newChart.remove();
      priceLineRef.current = null;
      seriesRef.current = { line: null, signal: null, hist: null, dummy: null };
    };
  }, [gridStrokeColor, height, onReady]);

  useEffect(() => {
    if (!chart || !data.length || !seriesRef.current.line) return;

    const dummyData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    try {
      seriesRef.current.line.setData(macdData.line);
      seriesRef.current.signal?.setData(macdData.signal);
      seriesRef.current.hist?.setData(macdData.hist);
      seriesRef.current.dummy?.setData(dummyData);

      seriesRef.current.line.applyOptions({
        title: macdStatus.title,
        color: macdStatus.color,
      });

      if (priceLineRef.current) {
        try {
          seriesRef.current.line.removePriceLine(priceLineRef.current);
        } catch {}
        priceLineRef.current = null;
      }

      if (macdStatus.value !== 0) {
        try {
          priceLineRef.current = seriesRef.current.line.createPriceLine({
            price: macdStatus.value,
            color: macdStatus.color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: macdStatus.title,
          });
        } catch {}
      }
    } catch (err) {
      console.error("Failed to update MACD series", err);
    }
  }, [chart, data, macdData, macdStatus]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
  );
};
