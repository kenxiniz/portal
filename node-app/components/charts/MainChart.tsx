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
  IPriceLine, // 💡 다시 추가됨
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

  const priceLinesRef = useRef<IPriceLine[]>([]); // 💡 다시 추가됨
  const boxPrimitiveRef = useRef<GaussianBoxPrimitive | null>(null);
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
      console.log("[MainChart] Symbol changed detected");
    }

    previousFirstDateRef.current = firstDate;
  }, [data]);

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

    const boxPrimitive = new GaussianBoxPrimitive([]);
    candleSeries.attachPrimitive(boxPrimitive);
    boxPrimitiveRef.current = boxPrimitive;

    const upperSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
    });
    const lowerSeries = chart.addSeries(LineSeries, {
      color: "#000000",
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false,
    });

    const vwapSeries = chart.addSeries(LineSeries, {
      color: "rgba(255, 235, 59, 1)",
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
    });

    const ema9Series = chart.addSeries(LineSeries, {
      color: "rgba(255, 255, 255, 0.8)",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: "rgba(33, 150, 243, 0.8)",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
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

    // 현재 visible range 저장 (첫 로드 아닐 때만)
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

    // Visible range 복원 (첫 로드 아닐 때만)
    if (savedRange && !isFirstLoadRef.current) {
      try {
        chartRef.current.timeScale().setVisibleLogicalRange(savedRange);
      } catch {
        // Range 복원 실패 무시
      }
    }

    isFirstLoadRef.current = false;

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

    const extData = data as ExtendedChartData[];

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

    seriesRef.current.upper?.setData(upData);
    seriesRef.current.lower?.setData(dnData);
    seriesRef.current.vwap?.setData(vwapData);
    seriesRef.current.ema9?.setData(ema9Data);
    seriesRef.current.ema20?.setData(ema20Data);

    // 💡 기존 priceLine 초기화 로직 복구
    priceLinesRef.current.forEach((pl) => {
      try {
        seriesRef.current.candle?.removePriceLine(pl);
      } catch {}
    });
    priceLinesRef.current = [];

    // 💡 태그(라벨)만 남기고 선은 투명하게 처리
    probLevels.forEach((lvl) => {
      try {
        const pl = seriesRef.current.candle?.createPriceLine({
          price: lvl.price,
          color: "transparent", // 핵심 1: 선 자체는 보이지 않게 투명 처리
          axisLabelColor: lvl.color, // 핵심 2: 우측 축 라벨의 배경색은 명시적으로 지정
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: lvl.title,
        });
        if (pl) priceLinesRef.current.push(pl);
      } catch {}
    });
  }, [data, probLevels, timeframe]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minWidth: 0 }}
    />
  );
};
