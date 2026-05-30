/* components/charts/PivotChart.tsx */
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
  Time,
  CandlestickData,
} from "lightweight-charts";
import { ProcessedChartData } from "../StockChartDisplay";
import { calculatePivotPoints } from "@/lib/charts/indicators";

interface PivotChartProps {
  data: ProcessedChartData[];
  timeframe: string;
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
}

export const PivotChart: React.FC<PivotChartProps> = ({
  data,
  timeframe,
  gridStrokeColor,
  height,
  onReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<{
    candle: ISeriesApi<"Candlestick"> | null;
    p: ISeriesApi<"Line"> | null;
    r2: ISeriesApi<"Line"> | null;
    r3: ISeriesApi<"Line"> | null;
    s2: ISeriesApi<"Line"> | null;
    s3: ISeriesApi<"Line"> | null;
  }>({
    candle: null,
    p: null,
    r2: null,
    r3: null,
    s2: null,
    s3: null,
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

    // P (Pivot Point) - 핑크색(Pink), 두껍게(lineWidth 3)
    const pSeries = chart.addSeries(LineSeries, {
      color: "#E91E63",
      lineWidth: 3,
      lineStyle: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 차트를 가로지르는 점선 제거
      title: "Pivot",
    });

    // R2, R3 (Resistance) - 파랑 계열(Blue)
    const r2Series = chart.addSeries(LineSeries, {
      color: "#42A5F5",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 차트를 가로지르는 점선 제거
      title: "R2",
    });
    const r3Series = chart.addSeries(LineSeries, {
      color: "#1E88E5",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 차트를 가로지르는 점선 제거
      title: "R3",
    });

    // S2, S3 (Support) - 빨강 계열(Red)
    const s2Series = chart.addSeries(LineSeries, {
      color: "#EF5350",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 차트를 가로지르는 점선 제거
      title: "S2",
    });
    const s3Series = chart.addSeries(LineSeries, {
      color: "#E53935",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false, // 💡 차트를 가로지르는 점선 제거
      title: "S3",
    });

    chartRef.current = chart;
    seriesRef.current = {
      candle: candleSeries,
      p: pSeries,
      r2: r2Series,
      r3: r3Series,
      s2: s2Series,
      s3: s3Series,
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

    const pivotInputs = data.map((d) => ({
      chartTime: d.time,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const pivots = calculatePivotPoints(pivotInputs);

    const pData: { time: Time; value: number }[] = [];
    const r2Data: { time: Time; value: number }[] = [];
    const r3Data: { time: Time; value: number }[] = [];
    const s2Data: { time: Time; value: number }[] = [];
    const s3Data: { time: Time; value: number }[] = [];

    for (let i = 0; i < data.length; i++) {
      const time = data[i].time;
      const pt = pivots[i];

      if (pt.p !== null) pData.push({ time, value: pt.p });
      if (pt.r2 !== null) r2Data.push({ time, value: pt.r2 });
      if (pt.r3 !== null) r3Data.push({ time, value: pt.r3 });
      if (pt.s2 !== null) s2Data.push({ time, value: pt.s2 });
      if (pt.s3 !== null) s3Data.push({ time, value: pt.s3 });
    }

    seriesRef.current.p?.setData(pData);
    seriesRef.current.r2?.setData(r2Data);
    seriesRef.current.r3?.setData(r3Data);
    seriesRef.current.s2?.setData(s2Data);
    seriesRef.current.s3?.setData(s3Data);
  }, [data, timeframe]);

  return <div ref={containerRef} style={{ width: "100%" }} />;
};
