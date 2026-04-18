/* components/charts/RsiChart.tsx */
"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  CandlestickSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineData,
  CandlestickData,
} from "lightweight-charts";
import { ProcessedChartData } from "../StockChartDisplay";

interface RsiChartProps {
  data: ProcessedChartData[];
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
}

export const RsiChart: React.FC<RsiChartProps> = ({
  data,
  gridStrokeColor,
  height,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const seriesRef = useRef<{
    rsi: ISeriesApi<"Line"> | null;
    dummy: ISeriesApi<"Candlestick"> | null;
  }>({ rsi: null, dummy: null });

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

    const rsiLineSeries = newChart.addSeries(LineSeries, {
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

    const dummySeries = newChart.addSeries(CandlestickSeries, {
      visible: false,
    });

    seriesRef.current = { rsi: rsiLineSeries, dummy: dummySeries };
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
      seriesRef.current = { rsi: null, dummy: null };
    };
  }, [gridStrokeColor, height, onReady]);

  useEffect(() => {
    if (!chart || !data.length || !seriesRef.current.rsi) return;

    const rsiData: LineData[] = data
      .filter((d) => d.rsi !== undefined)
      .map((d) => ({ time: d.time, value: d.rsi! }));
    const dummyData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    try {
      seriesRef.current.rsi.setData(rsiData);
      seriesRef.current.dummy?.setData(dummyData);
    } catch {}
  }, [chart, data]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
  );
};
