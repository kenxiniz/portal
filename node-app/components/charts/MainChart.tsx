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
import {
  calculateGaussianTrendBoxes,
  calculatePivotPoints,
} from "@/lib/charts/indicators";
import { GaussianBoxPrimitive } from "./plugins/GaussianBoxPrimitive";

interface MainChartProps {
  data: ProcessedChartData[];
  probLevels: { price: number; title: string; color: string }[];
  timeframe: string;
  gridStrokeColor: string;
  height: number;
  onReady: (chart: IChartApi) => void;
  probabilityBoxEnabled: boolean;
  bollingerEnabled: boolean;
  vwapEnabled: boolean;
  emaEnabled: boolean;
  pivotEnabled: boolean;
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
  probabilityBoxEnabled,
  bollingerEnabled,
  vwapEnabled,
  emaEnabled,
  pivotEnabled,
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
    p: ISeriesApi<"Line"> | null;
    r2: ISeriesApi<"Line"> | null;
    r3: ISeriesApi<"Line"> | null;
    s2: ISeriesApi<"Line"> | null;
    s3: ISeriesApi<"Line"> | null;
  }>({
    candle: null,
    upper: null,
    lower: null,
    vwap: null,
    ema9: null,
    ema20: null,
    p: null,
    r2: null,
    r3: null,
    s2: null,
    s3: null,
  });

  const priceLinesRef = useRef<IPriceLine[]>([]);
  const boxPrimitiveRef = useRef<GaussianBoxPrimitive | null>(null);
  const prevFirstDateRef = useRef<string | null>(null);
  const prevTimeframeRef = useRef<string | null>(null);
  const [yAxisInfo, setYAxisInfo] = React.useState<{
    min: number;
    max: number;
  } | null>(null);

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

    // Pivot series (1h/15m only)
    const pSeries = chart.addSeries(LineSeries, {
      color: "#FFB6C1",
      lineWidth: 3,
      lineStyle: 0,
      lineType: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "Pivot",
      visible: ["1h", "15m"].includes(timeframe),
    });

    const r2Series = chart.addSeries(LineSeries, {
      color: "#42A5F5",
      lineWidth: 1,
      lineStyle: 0,
      lineType: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "R2",
      visible: ["1h", "15m"].includes(timeframe),
    });

    const r3Series = chart.addSeries(LineSeries, {
      color: "#1E88E5",
      lineWidth: 1,
      lineStyle: 0,
      lineType: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "R3",
      visible: ["1h", "15m"].includes(timeframe),
    });

    const s2Series = chart.addSeries(LineSeries, {
      color: "#EF5350",
      lineWidth: 1,
      lineStyle: 0,
      lineType: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "S2",
      visible: ["1h", "15m"].includes(timeframe),
    });

    const s3Series = chart.addSeries(LineSeries, {
      color: "#E53935",
      lineWidth: 1,
      lineStyle: 0,
      lineType: 0,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: "S3",
      visible: ["1h", "15m"].includes(timeframe),
    });

    chartRef.current = chart;
    seriesRef.current = {
      candle: candleSeries,
      upper: upperSeries,
      lower: lowerSeries,
      vwap: vwapSeries,
      ema9: ema9Series,
      ema20: ema20Series,
      p: pSeries,
      r2: r2Series,
      r3: r3Series,
      s2: s2Series,
      s3: s3Series,
    };

    // Debug event: Y축 스케일 변경 (Puppeteer 테스트용)
    const handleDebugYScale = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!candleSeries || !chart) return;
      try {
        // autoScale 끄고 수동 범위 설정
        candleSeries.priceScale().applyOptions({ autoScale: false });
        // lightweight-charts v5: getVisibleRange / setVisibleRange 사용
        const priceScale = candleSeries.priceScale();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentRange = (priceScale as any).getVisibleRange?.();
        if (currentRange) {
          const mid = (currentRange.from + currentRange.to) / 2;
          const halfRange = (currentRange.to - currentRange.from) / 2;
          const factor = detail?.factor || 0.5; // 기본 50% 축소
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (priceScale as any).setVisibleRange?.({
            from: mid - halfRange * factor,
            to: mid + halfRange * factor,
          });
        }
      } catch {
        // disposed 무시
      }
    };
    window.addEventListener("debug-yscale", handleDebugYScale);

    onReady(chart);

    return () => {
      window.removeEventListener("debug-yscale", handleDebugYScale);
      chartRef.current = null;
      seriesRef.current = {
        candle: null,
        upper: null,
        lower: null,
        vwap: null,
        ema9: null,
        ema20: null,
        p: null,
        r2: null,
        r3: null,
        s2: null,
        s3: null,
      };
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStrokeColor, timeframe]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({ height });
    }
  }, [height]);

  useEffect(() => {
    if (!data.length || !seriesRef.current.candle || !chartRef.current) return;

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      color: d.color,
    }));

    // 종목 변경 감지 (첫 번째 + 마지막 데이터 날짜 + 첫 가격 비교)
    const firstDate = data[0]?.date || null;
    const lastDate = data[data.length - 1]?.date || null;
    const firstClose = data[0]?.close || 0;
    const dataSignature = `${firstDate}_${lastDate}_${firstClose.toFixed(2)}`;
    const prevSignature = prevFirstDateRef.current;
    const symbolChanged =
      prevSignature !== null && prevSignature !== dataSignature;
    prevFirstDateRef.current = dataSignature;

    // Timeframe 변경 감지
    const timeframeChanged =
      prevTimeframeRef.current !== null &&
      prevTimeframeRef.current !== timeframe;
    prevTimeframeRef.current = timeframe;

    // 종목이나 timeframe 변경이 아니면 현재 범위 저장
    let savedRange = null;
    if (!symbolChanged && !timeframeChanged && chartRef.current) {
      try {
        savedRange = chartRef.current.timeScale().getVisibleLogicalRange();
      } catch {}
    }

    seriesRef.current.candle.setData(candleData);

    // 저장된 범위 복원 또는 고정 봉 개수 적용
    if (savedRange) {
      // 종목/timeframe 변경이 아니면 사용자 위치 유지
      try {
        chartRef.current.timeScale().setVisibleLogicalRange(savedRange);
      } catch {}
    } else {
      // 종목/timeframe 변경 시 고정 봉 개수 적용
      const barCount = parseInt(
        process.env.NEXT_PUBLIC_CHART_BAR_COUNT || "100",
        10,
      );

      if (barCount > 0 && chartRef.current && data.length > 0) {
        try {
          chartRef.current.timeScale().getVisibleLogicalRange();
          // 음수 방지: 데이터가 barCount보다 적으면 0부터 시작
          const fromVal = Math.max(0, data.length - 1 - barCount);
          const toVal = data.length - 1;
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: fromVal,
            to: toVal,
          });
        } catch (err) {
          console.error(
            `[MainChart ${timeframe}] setVisibleLogicalRange error:`,
            err,
          );
        }
      }
    }

    // Y축 range 업데이트
    if (chartRef.current) {
      try {
        const visibleRange = chartRef.current
          .timeScale()
          .getVisibleLogicalRange();
        if (visibleRange) {
          const startIdx = Math.max(0, Math.floor(visibleRange.from));
          const endIdx = Math.min(data.length - 1, Math.ceil(visibleRange.to));

          let minPrice = Infinity;
          let maxPrice = -Infinity;

          for (let i = startIdx; i <= endIdx; i++) {
            if (data[i]) {
              minPrice = Math.min(minPrice, data[i].low);
              maxPrice = Math.max(maxPrice, data[i].high);
            }
          }

          if (minPrice !== Infinity && maxPrice !== -Infinity) {
            setYAxisInfo({ min: minPrice, max: maxPrice });
          }
        }
      } catch {}
    }

    // 종목 변경 시 Y축 자동 맞춤
    if (symbolChanged && seriesRef.current.candle) {
      try {
        seriesRef.current.candle.priceScale().applyOptions({
          autoScale: true,
        });
      } catch {
        // disposed 무시
      }
    }

    // Probability box (conditional)
    if (boxPrimitiveRef.current) {
      if (probabilityBoxEnabled) {
        const boxes = calculateGaussianTrendBoxes(data, 20, 3);
        boxPrimitiveRef.current.setData(boxes);
      } else {
        boxPrimitiveRef.current.setData([]);
      }
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

    // Bollinger Bands
    seriesRef.current.upper?.setData(bollingerEnabled ? upData : []);
    seriesRef.current.lower?.setData(bollingerEnabled ? dnData : []);

    // VWAP
    seriesRef.current.vwap?.setData(vwapEnabled ? vwapData : []);

    // EMA
    seriesRef.current.ema9?.setData(emaEnabled ? ema9Data : []);
    seriesRef.current.ema20?.setData(emaEnabled ? ema20Data : []);

    // Pivot data (1h/15m only)
    if (["1h", "15m"].includes(timeframe) && pivotEnabled) {
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
    } else {
      // 1d or disabled: clear pivot data
      seriesRef.current.p?.setData([]);
      seriesRef.current.r2?.setData([]);
      seriesRef.current.r3?.setData([]);
      seriesRef.current.s2?.setData([]);
      seriesRef.current.s3?.setData([]);
    }

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
  }, [
    data,
    probLevels,
    timeframe,
    probabilityBoxEnabled,
    bollingerEnabled,
    vwapEnabled,
    emaEnabled,
    pivotEnabled,
  ]);

  // Y축 정보 실시간 업데이트 (스크롤/줌 시)
  useEffect(() => {
    if (!chartRef.current || !data.length) return;

    const updateYAxis = () => {
      if (!chartRef.current) return;
      try {
        const visibleRange = chartRef.current
          .timeScale()
          .getVisibleLogicalRange();
        if (visibleRange) {
          const startIdx = Math.max(0, Math.floor(visibleRange.from));
          const endIdx = Math.min(data.length - 1, Math.ceil(visibleRange.to));

          let minPrice = Infinity;
          let maxPrice = -Infinity;

          for (let i = startIdx; i <= endIdx; i++) {
            if (data[i]) {
              minPrice = Math.min(minPrice, data[i].low);
              maxPrice = Math.max(maxPrice, data[i].high);
            }
          }

          if (minPrice !== Infinity && maxPrice !== -Infinity) {
            setYAxisInfo({ min: minPrice, max: maxPrice });
          }
        }
      } catch {}
    };

    const unsubscribe = chartRef.current
      .timeScale()
      .subscribeVisibleLogicalRangeChange(updateYAxis);

    return () => {
      try {
        unsubscribe();
      } catch {}
    };
  }, [data]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        position: "relative",
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", minWidth: 0 }}
      />
      {yAxisInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "4px",
            left: "4px",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            color: "white",
            fontSize: "10px",
            padding: "4px 8px",
            borderRadius: "4px",
            fontFamily: "monospace",
            zIndex: 10,
          }}
        >
          Y축: {yAxisInfo.min.toFixed(2)} ~ {yAxisInfo.max.toFixed(2)}
        </div>
      )}
    </div>
  );
};
