/* components/StockChartDisplay.tsx */

"use client";

import React, { useEffect, useRef } from 'react';
import { StockDataPoint, TradingSignal } from '@/lib/stockUtils';
import { createChart, ColorType, CandlestickSeries, LineSeries, CandlestickData, Time, CrosshairMode, LogicalRange, IChartApi } from 'lightweight-charts';

interface StockChartDisplayProps {
  data: StockDataPoint[] | null;
  /* [핵심] 누락되었던 signals prop 정의를 다시 추가합니다. */
  signals: TradingSignal[];
  gridStrokeColor: string;
  loading: boolean;
  error: string | null;
}

export const StockChartDisplay: React.FC<StockChartDisplayProps> = ({ data, signals, gridStrokeColor, loading, error }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ main: IChartApi | null, rsi: IChartApi | null }>({ main: null, rsi: null });

  useEffect(() => {
    if (loading || !Array.isArray(data) || data.length === 0 || !chartContainerRef.current || !rsiChartContainerRef.current) {
      return;
    }

    /* ----- 차트 생성 및 설정 ----- */
    const mainChart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
      grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
      width: chartContainerRef.current.clientWidth,
      height: 250,
      timeScale: { timeVisible: true, secondsVisible: false, rightBarStaysOnScroll: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'ko-KR', timeFormatter: (time: Time) => new Date(time as string).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) },
    });

      const rsiChart = createChart(rsiChartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
        grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
        width: rsiChartContainerRef.current.clientWidth,
        height: 100,
        timeScale: { visible: false },
        crosshair: { mode: CrosshairMode.Normal },
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = { main: mainChart, rsi: rsiChart };

      /* ----- 데이터 시리즈 추가 ----- */
      const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
        borderVisible: false, wickUpColor: '#999999', wickDownColor: '#999999',
      });
      const candlestickChartData: CandlestickData[] = data.map((d, i) => {
        let color = '#999999';
        if (i > 0) {
          const prevClose = data[i - 1].close;
          if (d.close > prevClose) color = d.close < d.open ? '#2962FF' : '#26a69a';
          else if (d.close < prevClose) color = d.close > d.open ? '#ef5350' : '#000000';
        }
        return { time: d.date as Time, open: d.open, high: d.high, low: d.low, close: d.close, color: color };
      });
      candlestickSeries.setData(candlestickChartData);

      const upperBandSeries = mainChart.addSeries(LineSeries, { color: '#ccc', lineWidth: 1, lineStyle: 2 });
      const lowerBandSeries = mainChart.addSeries(LineSeries, { color: '#ccc', lineWidth: 1, lineStyle: 2 });
      upperBandSeries.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.date as Time, value: d.bollingerBands!.upper })));
      lowerBandSeries.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.date as Time, value: d.bollingerBands!.lower })));

      const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#82ca9d', lineWidth: 2 });
      const rsiData = data.map(d => ({ time: d.date as Time, value: d.rsi, }));
      rsiSeries.setData(rsiData);

      rsiSeries.createPriceLine({ price: 70, color: 'red', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '과매수' });
      rsiSeries.createPriceLine({ price: 30, color: 'green', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '과매도' });

      /* ----- 초기 범위 설정 ----- */
      if (data.length > 1) {
        const lastDate = data[data.length - 1].date;
        const twoMonthsAgoDate = new Date(lastDate);
        twoMonthsAgoDate.setMonth(twoMonthsAgoDate.getMonth() - 2);
        mainChart.timeScale().setVisibleRange({
          from: twoMonthsAgoDate.toISOString().split('T')[0] as Time,
          to: lastDate as Time,
        });
      }

      mainChart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange: LogicalRange | null) => {
        if(logicalRange) rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
      });

      /* ----- 창 크기 변경 핸들러 ----- */
      const handleResize = () => {
        mainChart.applyOptions({ width: chartContainerRef.current!.clientWidth });
        rsiChart.applyOptions({ width: rsiChartContainerRef.current!.clientWidth });
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if(chartRef.current.main) chartRef.current.main.remove();
        if(chartRef.current.rsi) chartRef.current.rsi.remove();
      };
      /* [핵심] useEffect 의존성 배열에도 signals를 다시 추가합니다. */
  }, [data, signals, gridStrokeColor, loading, error]);

  if (loading) return <p className="text-slate-700 dark:text-slate-300">데이터 로딩 중...</p>;
  if (error) return <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert"><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{error}</span></div>;

  return (
    <div className="flex flex-col gap-1">
    <div ref={chartContainerRef} style={{ width: '100%', height: '250px' }} />
    <div ref={rsiChartContainerRef} style={{ width: '100%', height: '100px' }} />
    </div>
  );
};
