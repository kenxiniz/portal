/* components/StockChartDisplay.tsx */

"use client";

import React, { useEffect, useRef } from 'react';
import { StockDataPoint, TradingSignal } from '@/lib/stockUtils';
/* 오류 수정: 사용되지 않는 'LineData'와 'WhitespaceData' 타입을 import 목록에서 제거합니다. */
import { createChart, ColorType, CandlestickSeries, LineSeries, CandlestickData, Time, SeriesMarker } from 'lightweight-charts';

interface StockChartDisplayProps {
  data: StockDataPoint[];
  signals: TradingSignal[];
  gridStrokeColor: string;
  loading: boolean;
  error: string | null;
}

export const StockChartDisplay: React.FC<StockChartDisplayProps> = ({ data, signals, gridStrokeColor, loading, error }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !rsiChartContainerRef.current || data.length === 0) return;

    /* ----- 메인 차트 (캔들스틱) 생성 ----- */
    const mainChart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
      grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
      width: chartContainerRef.current.clientWidth,
      height: 250,
      timeScale: { timeVisible: true, secondsVisible: false }
    });

    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      borderVisible: false, wickUpColor: '#999999', wickDownColor: '#999999',
    });

    const markersByDate = new Map<string, SeriesMarker<Time>>();
    signals.forEach(signal => {
      let markerConfig: SeriesMarker<Time> = {
        time: signal.date as Time,
        position: 'inBar',
        color: 'transparent',
        shape: 'circle',
        text: ''
      };
      if (signal.type === 'buy') {
        markerConfig = { ...markerConfig, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: '매수' };
      } else if (signal.type === 'sell') {
        markerConfig = { ...markerConfig, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: '매도' };
      } else if (signal.type === 'inverse-buy') {
        markerConfig = { ...markerConfig, position: 'aboveBar', color: '#ff9800', shape: 'arrowDown', text: '인버스' };
      }
      if (markerConfig.text) {
        markersByDate.set(signal.date, markerConfig);
      }
    });

    const chartData: (CandlestickData & Partial<SeriesMarker<Time>>)[] = data.map((d, i) => {
      let color = '#999999';
      if (i > 0) {
        const prevClose = data[i - 1].close;
        if (d.close > prevClose) color = d.close < d.open ? '#2962FF' : '#26a69a';
        else if (d.close < prevClose) color = d.close > d.open ? '#ef5350' : '#000000';
      }

      const marker = markersByDate.get(d.date);

      return {
        time: d.date as Time, open: d.open, high: d.high, low: d.low, close: d.close, color: color,
        /* 마커가 있는 경우, 해당 속성을 데이터 객체에 포함시킵니다. */
        ...(marker && { 
          position: marker.position, 
          color: marker.color, 
          shape: marker.shape, 
          text: marker.text 
        })
      };
    });
    candlestickSeries.setData(chartData);

    if (data.length > 1) {
      const lastDate = new Date(data[data.length - 1].date);
      const twoMonthsAgo = new Date(lastDate);
      twoMonthsAgo.setMonth(lastDate.getMonth() - 2);
      mainChart.timeScale().setVisibleRange({
        from: (twoMonthsAgo.getTime() / 1000) as Time,
        to: (lastDate.getTime() / 1000) as Time,
      });
    }

    const upperBandSeries = mainChart.addSeries(LineSeries, { color: '#ccc', lineWidth: 1, lineStyle: 2 });
    const lowerBandSeries = mainChart.addSeries(LineSeries, { color: '#ccc', lineWidth: 1, lineStyle: 2 });
    upperBandSeries.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.date as Time, value: d.bollingerBands!.upper })));
    lowerBandSeries.setData(data.filter(d => d.bollingerBands).map(d => ({ time: d.date as Time, value: d.bollingerBands!.lower })));

    /* -----
     * RSI
     * 차트
     * 생성
     * -----
     *  */
    const rsiChart = createChart(rsiChartContainerRef.current, {
layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
width: rsiChartContainerRef.current.clientWidth,
height: 100,
timeScale: { visible: false },
});

    const rsiSeries = rsiChart.addSeries(LineSeries, { color: '#82ca9d', lineWidth: 2 });
    rsiSeries.setData(data.filter(d => d.rsi).map(d => ({ time: d.date as Time, value: d.rsi! })));

    rsiSeries.createPriceLine({ price: 70, color: 'red', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '과매수' });
    rsiSeries.createPriceLine({ price: 30, color: 'green', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '과매도' });

    mainChart.timeScale().subscribeVisibleTimeRangeChange(timeRange => rsiChart.timeScale().setVisibleRange(timeRange!));

    const handleResize = () => {
      mainChart.applyOptions({ width: chartContainerRef.current!.clientWidth });
      rsiChart.applyOptions({ width: rsiChartContainerRef.current!.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      rsiChart.remove();
    };
  }, [data, signals, gridStrokeColor]);

  if (loading) return <p className="text-slate-700 dark:text-slate-300">데이터 로딩 중...</p>;
  if (error) return <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert"><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{error}</span></div>;
  if (!data || data.length === 0) return <p className="text-slate-500 dark:text-slate-400">차트를 표시할 데이터가 없습니다.</p>;

  return (
    <div className="flex flex-col gap-1">
    <div ref={chartContainerRef} style={{ width: '100%', height: '250px' }} />
    <div ref={rsiChartContainerRef} style={{ width: '100%', height: '100px' }} />
    </div>
  );
};
