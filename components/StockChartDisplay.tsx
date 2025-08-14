/* components/StockChartDisplay.tsx */

"use client";

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StockDataPoint, TradingSignal } from '@/lib/stockUtils';
import { createChart, ColorType, CandlestickSeries, LineSeries, CandlestickData, Time, CrosshairMode, LogicalRange, IChartApi } from 'lightweight-charts';

interface StockChartDisplayProps {
  data: StockDataPoint[] | null;
  signals: TradingSignal[];
  gridStrokeColor: string;
  loading: boolean;
  error: string | null;
}

export interface StockChartDisplayHandles {
  moveToDate: (date: string) => void;
}

export const StockChartDisplay = forwardRef<StockChartDisplayHandles, StockChartDisplayProps>(
  ({ data, signals, gridStrokeColor, loading, error }, ref) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const rsiChartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<{ main: IChartApi | null, rsi: IChartApi | null }>({ main: null, rsi: null });

    useImperativeHandle(ref, () => ({
      moveToDate(date: string) {
        if (chartRef.current.main && data && data.length > 0) {
          const targetIndex = data.findIndex(d => d.date === date);

          if (targetIndex !== -1) {
            const logicalRange = chartRef.current.main.timeScale().getVisibleLogicalRange();
            if (logicalRange) {
              const lastIndex = data.length - 1;
              const barsVisible = logicalRange.to - logicalRange.from;
              const positionFromRight = -(lastIndex - targetIndex);
              const finalPosition = positionFromRight + Math.floor(barsVisible / 2);
              chartRef.current.main.timeScale().scrollToPosition(finalPosition, true);
            }
          }
        }
      },
    }));


    useEffect(() => {
      if (loading || !Array.isArray(data) || data.length === 0 || !chartContainerRef.current || !rsiChartContainerRef.current) {
        return;
      }

      /* [수정] 화면 너비에 따라 차트 높이를 동적으로 결정합니다. */
      const isPcScreen = window.innerWidth >= 1024;
      const mainChartHeight = isPcScreen ? 400 : 250;
      const rsiChartHeight = isPcScreen ? 120 : 100;

      /* [수정] 차트를 감싸는 div의 높이도 동적으로 설정합니다. */
      chartContainerRef.current.style.height = `${mainChartHeight}px`;
      rsiChartContainerRef.current.style.height = `${rsiChartHeight}px`;

      const mainChart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
        grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
        width: chartContainerRef.current.clientWidth,
        height: mainChartHeight, /* [수정] 동적으로 계산된 높이를 적용합니다. */
        timeScale: { timeVisible: true, secondsVisible: false, rightBarStaysOnScroll: false },
        crosshair: { mode: CrosshairMode.Normal },
        localization: { locale: 'ko-KR', timeFormatter: (time: Time) => new Date(time as string).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) },
      });

        const rsiChart = createChart(rsiChartContainerRef.current, {
          layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: gridStrokeColor },
          grid: { vertLines: { color: 'rgba(70, 130, 180, 0.1)' }, horzLines: { color: 'rgba(70, 130, 180, 0.1)' } },
          width: rsiChartContainerRef.current.clientWidth,
          height: rsiChartHeight, /* [수정] 동적으로 계산된 높이를 적용합니다. */
          timeScale: { visible: false },
          crosshair: { mode: CrosshairMode.Normal },
          handleScroll: false,
          handleScale: false,
        });

        chartRef.current = { main: mainChart, rsi: rsiChart };

        const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
          upColor: '#E53935',
          downColor: '#1E88E5',
          borderUpColor: 'black',
          borderDownColor: 'black',
          wickUpColor: '#E53935',
          wickDownColor: '#1E88E5',
        });

        const candlestickChartData: CandlestickData[] = data.map((d) => {
          let color: string | undefined = undefined;
          const buySignalPeriod = signals.find(s => s.startDate && s.date && d.date >= s.startDate && d.date <= s.date && s.type.includes('buy'));
          const sellSignalDay = signals.find(s => s.date === d.date && s.type === 'sell');
          if (buySignalPeriod || sellSignalDay) {
            color = '#FFEB3B';
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

        if (data.length > 1) {
          const lastDate = data.at(-1)!.date;
          const fromDate = new Date(lastDate);
          const screenWidth = window.innerWidth;
          if (screenWidth >= 1024) {
            fromDate.setMonth(fromDate.getMonth() - 8);
          } else if (screenWidth >= 768) {
            fromDate.setMonth(fromDate.getMonth() - 4);
          } else {
            fromDate.setMonth(fromDate.getMonth() - 2);
          }
          mainChart.timeScale().setVisibleRange({
            from: fromDate.toISOString().split('T')[0] as Time,
            to: lastDate as Time,
          });
        }

        mainChart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange: LogicalRange | null) => {
          if(logicalRange) rsiChart.timeScale().setVisibleLogicalRange(logicalRange);
        });

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
    }, [data, signals, gridStrokeColor, loading, error]);

    if (loading) return <p className="text-slate-700 dark:text-slate-300">데이터 로딩 중...</p>;
    if (error) return <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert"><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{error}</span></div>;

    return (
      <div className="flex flex-col gap-1">
      {/* [수정] 초기 높이는 CSS/Tailwind로 관리하거나 비워두고 useEffect에서 동적으로 설정합니다. */}
      <div ref={chartContainerRef} style={{ width: '100%' }} />
      <div ref={rsiChartContainerRef} style={{ width: '100%' }} />
      </div>
    );
  }
);

StockChartDisplay.displayName = 'StockChartDisplay';
