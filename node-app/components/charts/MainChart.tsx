/* components/charts/MainChart.tsx */
"use client";

import React, { useEffect, useRef, useState } from "react";
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
  LineData,
} from "lightweight-charts";
import { ProcessedChartData } from "../StockChartDisplay";

interface MainChartProps {
  data: ProcessedChartData[];
  probLevels: { price: number; title: string; color: string }[];
  timeframe: string;
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
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
  const [chart, setChart] = useState<IChartApi | null>(null);
  const seriesRef = useRef<{
    candle: ISeriesApi<"Candlestick"> | null;
    upper: ISeriesApi<"Line"> | null;
    lower: ISeriesApi<"Line"> | null;
  }>({ candle: null, upper: null, lower: null });

  const priceLinesRef = useRef<IPriceLine[]>([]);

  // --- 차트 초기화 및 리사이징 ---
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

    const candleSeries = newChart.addSeries(CandlestickSeries, {
      upColor: "#E53935",
      downColor: "#1E88E5",
      borderUpColor: "black",
      borderDownColor: "black",
      wickUpColor: "#E53935",
      wickDownColor: "#1E88E5",
    });

    // 모든 시간대에서 볼린저 밴드 라인 생성
    const upperSeries = newChart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
    });
    const lowerSeries = newChart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
    });

    seriesRef.current = {
      candle: candleSeries,
      upper: upperSeries,
      lower: lowerSeries,
    };
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
      seriesRef.current = { candle: null, upper: null, lower: null };
      priceLinesRef.current = [];
    };
  }, [gridStrokeColor, timeframe, height, onReady]);

  // --- 데이터 업데이트 ---
  useEffect(() => {
    if (!chart || !data.length || !seriesRef.current.candle) return;

    const candleData: CandlestickData[] = data.map((d) => {
      const pt: CandlestickData = {
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      };
      if (d.color) pt.color = d.color;
      return pt;
    });

    try {
      seriesRef.current.candle.setData(candleData);

      // 모든 시간대에서 볼린저 밴드 데이터 세팅
      const upData: LineData[] = data
        .filter((d) => d.upper !== undefined)
        .map((d) => ({ time: d.time, value: d.upper! }));
      const dnData: LineData[] = data
        .filter((d) => d.lower !== undefined)
        .map((d) => ({ time: d.time, value: d.lower! }));
      seriesRef.current.upper?.setData(upData);
      seriesRef.current.lower?.setData(dnData);

      // 프로빌러티 Y축 태그 초기화 및 생성
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
            lineVisible: false, // 선 숨기고 우측 Y축 태그만 표시
          });
          if (pl) priceLinesRef.current.push(pl);
        } catch {}
      });
    } catch {
      // Ignored disposed errors
    }
  }, [chart, data, probLevels, timeframe]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
  );
};
