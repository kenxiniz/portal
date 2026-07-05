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
  const isFirstLoadRef = useRef(true);
  const previousFirstDateRef = useRef<string | null>(null);

  // timeframe 변경 시 firstLoad 플래그 리셋
  useEffect(() => {
    isFirstLoadRef.current = true;
  }, [timeframe]);

  // 종목 변경 감지 (첫 데이터 날짜 변경)
  useEffect(() => {
    if (data.length === 0) return;

    const firstDate = data[0].date;
    if (
      previousFirstDateRef.current !== null &&
      previousFirstDateRef.current !== firstDate
    ) {
      // 종목 변경 시 firstLoad 리셋 → range preservation skip → Y축 자동 맞춤
      isFirstLoadRef.current = true;
      console.log("[PivotChart] Symbol changed detected");
    }

    previousFirstDateRef.current = firstDate;
  }, [data]);

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
      upColor: "#66BB6A",
      downColor: "#000000",
      borderUpColor: "#66BB6A",
      borderDownColor: "#000000",
      wickUpColor: "#66BB6A",
      wickDownColor: "#000000",
    });

    // P (Pivot Point)
    const pSeries = chart.addSeries(LineSeries, {
      color: "#FFB6C1", // Changed to light pink
      lineWidth: 3,
      lineStyle: 0, // Solid line
      lineType: 0, // Changed to Simple (diagonal line)
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "Pivot",
    });

    // R2, R3 (Resistance)
    const r2Series = chart.addSeries(LineSeries, {
      color: "#42A5F5",
      lineWidth: 1,
      lineStyle: 0, // Changed to 0 for solid line
      lineType: 0, // Changed to Simple (diagonal line)
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "R2",
    });
    const r3Series = chart.addSeries(LineSeries, {
      color: "#1E88E5",
      lineWidth: 1,
      lineStyle: 0, // Changed to 0 for solid line
      lineType: 0, // Changed to Simple (diagonal line)
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "R3",
    });

    // S2, S3 (Support)
    const s2Series = chart.addSeries(LineSeries, {
      color: "#EF5350",
      lineWidth: 1,
      lineStyle: 0, // Changed to 0 for solid line
      lineType: 0, // Changed to Simple (diagonal line)
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "S2",
    });
    const s3Series = chart.addSeries(LineSeries, {
      color: "#E53935",
      lineWidth: 1,
      lineStyle: 0, // Changed to 0 for solid line
      lineType: 0, // Changed to Simple (diagonal line)
      crosshairMarkerVisible: false,
      priceLineVisible: false,
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

    return () => {
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
    if (!data.length || !seriesRef.current.candle || !chartRef.current) return;

    // 현재 visible range 저장
    let savedRange = null;
    if (!isFirstLoadRef.current) {
      savedRange = chartRef.current.timeScale().getVisibleLogicalRange();
    }

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: d.color,
    }));

    seriesRef.current.candle.setData(candleData);

    // Visible range 복원
    if (savedRange && !isFirstLoadRef.current) {
      try {
        chartRef.current.timeScale().setVisibleLogicalRange(savedRange);
      } catch {
        // Range 복원 실패 무시
      }
    }

    isFirstLoadRef.current = false;

    // 💡 수정됨: date 필드를 반드시 포함하여 넘겨주고, 줄바꿈(\n)을 다시 공백으로 복원합니다.
    const pivotInputs = data.map((d) => ({
      date: d.date.replace("\n", " "),
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

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minWidth: 0 }}
    />
  );
};
