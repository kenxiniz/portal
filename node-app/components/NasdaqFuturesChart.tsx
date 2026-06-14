/* components/NasdaqFuturesChart.tsx */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from "lightweight-charts";

interface FuturesChartData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// [NEW] Define API response data type to resolve 'any' error
interface ApiDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  ticker: string; // e.g., 'NQM4' for Nasdaq E-mini
}

export default function NasdaqFuturesChart({ ticker }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartData, setChartData] = useState<FuturesChartData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchChartData() {
      try {
        console.log("[Chart Component] Starting data fetch for", ticker);

        // Request immediate DB hydration if cache is missing via ?refresh=true
        const res = await fetch(
          `/api/futures/${ticker}?timeframe=1d&refresh=true`,
        );
        const result = await res.json();

        if (result && result.data && Array.isArray(result.data)) {
          // [MODIFIED] Use ApiDataPoint interface instead of 'any'
          const formattedData = result.data.map((item: ApiDataPoint) => ({
            time: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }));

          setChartData(formattedData);
        }
      } catch (err) {
        console.error("[Chart Component] Data fetch exception:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchChartData();
  }, [ticker]);

  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Initialize chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "rgba(43, 43, 67, 0.5)" },
        horzLines: { color: "rgba(43, 43, 67, 0.5)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#ef5350", // Red for uptrend in Korean chart standard
      downColor: "#26a69a", // Blue/Green for downtrend in Korean chart standard
      borderVisible: false,
      wickUpColor: "#ef5350",
      wickDownColor: "#26a69a",
    });

    candlestickSeries.setData(chartData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[350px] text-slate-500 dark:text-slate-400">
        <div className="animate-pulse">Loading Futures Data...</div>
      </div>
    );
  }

  if (!isLoading && chartData.length === 0) {
    return (
      <div className="flex justify-center items-center h-[350px] text-red-500">
        Failed to load chart data.
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">
        Nasdaq 100 Futures{" "}
        <span className="text-sm text-slate-500 font-normal">({ticker})</span>
      </h2>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
