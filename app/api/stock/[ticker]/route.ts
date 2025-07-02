/* app/api/stock/[ticker]/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { StockDataPoint, CachedStockData } from '@/lib/stockUtils';

/* 캐시 파일 경로를 .cache 폴더 안으로 지정합니다. */
const cacheDir = path.join(process.cwd(), '.cache');
const stockCachePath = path.join(cacheDir, 'stock-cache.json');

/* stock.json 파일의 타입 정의 */
interface StockCache {
  [key: string]: CachedStockData;
}

/* 캐시 파일을 읽어오는 함수 */
async function readStockCache(): Promise<StockCache> {
  try {
    const fileContent = await fs.readFile(stockCachePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    /* 파일이 없거나 오류가 발생하면 빈 객체를 반환합니다. */
    return {};
  }
}

/* 캐시 파일을 저장하는 함수 */
async function writeStockCache(data: StockCache): Promise<void> {
  try {
    /* .cache 디렉터리가 없으면 생성합니다. */
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(stockCachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("Error writing stock cache file:", error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const ticker = pathParts[pathParts.length - 1];

  const API_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const stockCache = await readStockCache();
  const cachedTickerData = stockCache[ticker];
  const today = new Date().toISOString().split('T')[0];

  if (cachedTickerData && cachedTickerData.lastFetch === today) {
    console.log(`[API Route - ${ticker}] Loading from cache.`);
    return NextResponse.json(cachedTickerData.data);
  }

  console.log(`[API Route - ${ticker}] Fetching from API.`);

  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    return NextResponse.json({ error: "API Key is not configured on the server." }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${API_KEY}`
    );

      if (!response.ok) {
        throw new Error(`Alpha Vantage API error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data['Time Series (Daily)']) {
        const timeSeries = data['Time Series (Daily)'];
        const chartData: StockDataPoint[] = [];
        const now = new Date();
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(now.getMonth() - 3);

        for (const dateKey in timeSeries) {
          const date = new Date(dateKey);
          if (date >= threeMonthsAgo && date <= now) {
            chartData.push({
              date: dateKey,
              open: parseFloat(timeSeries[dateKey]['1. open']),
              high: parseFloat(timeSeries[dateKey]['2. high']),
              low: parseFloat(timeSeries[dateKey]['3. low']),
              close: parseFloat(timeSeries[dateKey]['4. close']),
              volume: parseFloat(timeSeries[dateKey]['6. volume']),
            });
          }
        }
        chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        stockCache[ticker] = { lastFetch: today, data: chartData };
        await writeStockCache(stockCache);

        return NextResponse.json(chartData);
      } else {
        const errorMessage = data["Note"] || data["Error Message"] || "No data available.";
        throw new Error(errorMessage);
      }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
    console.error(`[API Route - ${ticker}] Failed to fetch data:`, e);
    return NextResponse.json({ error: `Failed to load data for ${ticker}. Error: ${errorMessage}` }, { status: 500 });
  }
}
