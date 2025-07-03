/* app/api/stock/[ticker]/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { StockDataPoint, CachedStockData, calculateRSI, calculateBollingerBands, analyzeAllTradingSignals } from '@/lib/stockUtils';

const cacheDir = path.join(process.cwd(), '.cache');
const stockCachePath = path.join(cacheDir, 'stock-cache.json');

interface StockCache {
  [key: string]: CachedStockData;
}

async function readStockCache(): Promise<StockCache> {
  try {
    const fileContent = await fs.readFile(stockCachePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch {
    return {};
  }
}

async function writeStockCache(data: StockCache): Promise<void> {
  try {
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
  let rawData: StockDataPoint[];

  if (cachedTickerData && cachedTickerData.lastFetch === today) {
    console.log(`✅ [${ticker}] CACHE HIT: Loading raw data from cache file.`);
    rawData = cachedTickerData.data;
  } else {
    console.log(`❌ [${ticker}] CACHE MISS: Fetching new data from Alpha Vantage API.`);
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
      return NextResponse.json({ error: "API Key is not configured on the server." }, { status: 500 });
    }
    try {
      const response = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${API_KEY}`
      );
        if (!response.ok) throw new Error(`Alpha Vantage API error! status: ${response.status}`);
        const data = await response.json();
        if (data['Time Series (Daily)']) {
          const timeSeries = data['Time Series (Daily)'];
          const allDataPoints: StockDataPoint[] = [];
          for (const dateKey in timeSeries) {
            allDataPoints.push({
              date: dateKey,
              open: parseFloat(timeSeries[dateKey]['1. open']),
              high: parseFloat(timeSeries[dateKey]['2. high']),
              low: parseFloat(timeSeries[dateKey]['3. low']),
              close: parseFloat(timeSeries[dateKey]['4. close']),
              volume: parseFloat(timeSeries[dateKey]['6. volume']),
            });
          }
          allDataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          const now = new Date();
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(now.getFullYear() - 1);
          rawData = allDataPoints.filter(d => new Date(d.date) >= oneYearAgo);
          stockCache[ticker] = { lastFetch: today, data: rawData };
          await writeStockCache(stockCache);
        } else {
          throw new Error(data["Note"] || data["Error Message"] || "No data available.");
        }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      console.error(`[API Route - ${ticker}] Failed to fetch data:`, e);
      return NextResponse.json({ error: `Failed to load data for ${ticker}. Error: ${errorMessage}` }, { status: 500 });
    }
  }

  const dataWithIndicators = calculateBollingerBands(calculateRSI(rawData));
  const signals = analyzeAllTradingSignals(dataWithIndicators);
  return NextResponse.json({ data: dataWithIndicators, signals: signals });
}
