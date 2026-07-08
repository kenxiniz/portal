"use client";

import React, { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  CandlestickSeries,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
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
  // Add chartRef to safely handle dynamic resize without re-rendering chart
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    rsi: ISeriesApi<"Line"> | null;
    dummy: ISeriesApi<"Candlestick"> | null;
  }>({ rsi: null, dummy: null });

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
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

    const rsiLineSeries = chart.addSeries(LineSeries, {
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

    const dummySeries = chart.addSeries(CandlestickSeries, { visible: false });

    seriesRef.current = { rsi: rsiLineSeries, dummy: dummySeries };
    onReady(chart);

    return () => {
      chart.remove();
    };
    // Intentionally omitting 'height' to prevent chart destruction on resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStrokeColor]);

  // Handle dynamic height changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  useEffect(() => {
    if (!data.length || !seriesRef.current.rsi) return;

    const rsiData = data
      .filter((d) => d.rsi !== undefined)
      .map((d) => ({ time: d.time, value: d.rsi! }));
    const dummyData = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: d.color,
    }));

    try {
      seriesRef.current.rsi.setData(rsiData);
      seriesRef.current.dummy?.setData(dummyData);
    } catch {}
  }, [data]);

  // 💡 오늘(최근) 기준 RSI 데이터를 추출하여 과매수/과매도 판별 (UI 태그용)
  let rsiStatus = null;
  if (data.length > 0) {
    const lastRsi = data[data.length - 1].rsi;
    if (lastRsi !== undefined) {
      if (lastRsi >= 70) {
        rsiStatus = { title: "과매수", color: "#ef5350" }; // Red
      } else if (lastRsi <= 30) {
        rsiStatus = { title: "과매도", color: "#2e7d32" }; // Green
      }
    }
  }

  // 💡 기존 로직은 100% 유지하고 화면 좌상단에 RSI UI 태그만 추가했습니다.
  return (
    <div className="relative w-full h-full">
      {rsiStatus && (
        <div className="absolute top-2 left-2 z-10 flex gap-1 pointer-events-none">
          <div
            className="px-2 py-0.5 text-xs font-semibold rounded text-white shadow-sm"
            style={{ backgroundColor: rsiStatus.color }}
          >
            {rsiStatus.title}
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minWidth: 0 }}
      />
    </div>
  );
};
