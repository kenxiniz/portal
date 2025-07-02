/* components/StockChartDisplay.tsx */

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { StockDataPoint } from '@/lib/stockUtils';

interface StockChartDisplayProps {
  data: StockDataPoint[];
  gridStrokeColor: string;
  loading: boolean;
  error: string | null;
}

/*
 *   - 오류 해결: [key: string]: any 타입을 [key: string]: unknown 으로 변경하여
 *     - @typescript-eslint/no-explicit-any 규칙을 준수합니다.
 *     */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: StockDataPoint;
    [key: string]: unknown;
  }>;
  label?: string | number;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="p-2 bg-slate-800 text-white rounded-md border border-slate-700 text-xs shadow-lg">
      <p className="font-bold">{`날짜: ${new Date(label as string).toLocaleDateString()}`}</p>
      <hr className="my-1 border-slate-600" />
      <p>종가: <span className="font-mono">{data.close.toFixed(2)}</span></p>
      {data.rsi != null && <p>RSI(14): <span className="font-mono">{data.rsi.toFixed(2)}</span></p>}
      </div>
    );
  }
  return null;
};

export const StockChartDisplay: React.FC<StockChartDisplayProps> = ({ data, gridStrokeColor, loading, error }) => {
  if (loading) {
    return <p className="text-slate-700 dark:text-slate-300">데이터 로딩 중...</p>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
      <strong className="font-bold">Error:</strong>
      <span className="block sm:inline ml-2">{error}</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">지난 3개월간 데이터가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
    {/* 주가 차트 (선 그래프) */}
    <ResponsiveContainer width="100%" height={250}>
    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
    <XAxis dataKey="date" tickFormatter={(tick) => new Date(tick).toLocaleDateString()} />
    <YAxis domain={['dataMin - 5', 'dataMax + 5']} />
    <Tooltip content={<CustomTooltip />} />
    <Legend />
    <Line type="monotone" dataKey="close" stroke="#8884d8" dot={false} name="종가" />
    </LineChart>
    </ResponsiveContainer>

    {/* RSI 보조지표 차트 */}
    <ResponsiveContainer width="100%" height={100}>
    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
    <CartesianGrid strokeDasharray="3 3" stroke={gridStrokeColor} />
    <XAxis dataKey="date" hide={true} />
    <YAxis domain={[0, 100]} tickCount={3} />
    <Tooltip content={<CustomTooltip />} />
    <Line type="monotone" dataKey="rsi" stroke="#82ca9d" dot={false} name="RSI(14)" />
    <ReferenceLine y={70} stroke="red" strokeDasharray="3 3" label={{ value: '과매수 (70)', position: 'insideTopRight', fill: 'red', fontSize: 10 }} />
    <ReferenceLine y={30} stroke="green" strokeDasharray="3 3" label={{ value: '과매도 (30)', position: 'insideBottomRight', fill: 'green', fontSize: 10 }} />
    </LineChart>
    </ResponsiveContainer>
    </div>
  );
};
