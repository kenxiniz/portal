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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChartData() {
      try {
        console.log("[Nasdaq Futures Chart] Fetching data for ticker:", ticker);

        // Request immediate DB hydration if cache is missing via ?refresh=true
        const res = await fetch(
          `/api/futures/${ticker}?timeframe=1d&refresh=true`,
        );

        console.log("[Nasdaq Futures Chart] Response status:", res.status);

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const result = await res.json();
        console.log("[Nasdaq Futures Chart] Data received:", {
          dataLength: result.data?.length || 0,
          hasSignals: !!result.signals,
          hasAdvice: !!result.advice,
        });

        if (result && result.data && Array.isArray(result.data)) {
          if (result.data.length === 0) {
            throw new Error("No data returned from API");
          }

          // [MODIFIED] Use ApiDataPoint interface instead of 'any'
          const formattedData = result.data.map((item: ApiDataPoint) => ({
            time: item.date,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }));

          console.log("[Nasdaq Futures Chart] Chart data formatted:", {
            count: formattedData.length,
            first: formattedData[0],
            last: formattedData[formattedData.length - 1],
          });

          setChartData(formattedData);
          setError(null);
        } else {
          throw new Error("Invalid response format");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        console.error("[Nasdaq Futures Chart] Error:", errorMessage, err);
        setError(errorMessage);
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
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">
          Nasdaq 100 Futures{" "}
          <span className="text-sm text-slate-500 font-normal">({ticker})</span>
        </h2>
        <div className="flex justify-center items-center h-[350px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-pulse">Loading Futures Data...</div>
            <div className="text-xs text-slate-400">Ticker: {ticker}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">
          Nasdaq 100 Futures{" "}
          <span className="text-sm text-slate-500 font-normal">({ticker})</span>
        </h2>
        <div className="flex justify-center items-center h-[350px] text-red-500">
          <div className="flex flex-col items-center gap-2 max-w-md text-center">
            <div className="text-lg font-semibold">
              Failed to load chart data
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {error}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Ticker: {ticker} | Check console for details
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && chartData.length === 0) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">
          Nasdaq 100 Futures{" "}
          <span className="text-sm text-slate-500 font-normal">({ticker})</span>
        </h2>
        <div className="flex justify-center items-center h-[350px] text-amber-500">
          <div className="flex flex-col items-center gap-2">
            <div>No data available</div>
            <div className="text-xs text-slate-500">Ticker: {ticker}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">
        Nasdaq 100 Futures{" "}
        <span className="text-sm text-slate-500 font-normal">({ticker})</span>
        <span className="text-xs text-green-600 dark:text-green-400 ml-2">
          ✓ {chartData.length} candles
        </span>
      </h2>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
