/* /app/api/k-stock/[ticker]/route.ts */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { StockDataPoint, CachedStockData, calculateRSI, calculateBollingerBands, analyzeAllTradingSignals } from '@/lib/stockUtils';
import { getDailyKoreanStockData } from '@/lib/koreanKisApi'; // 한국 주식용 API 클라이언트 사용

const cacheDir = path.join(process.cwd(), '.cache');
/* [수정] 한국 주식 전용 캐시 파일 경로 */
const stockCachePath = path.join(cacheDir, 'korean-stock-cache.json');

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
    console.error("Error writing K-stock cache file:", error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const ticker = pathParts[pathParts.length - 1];

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const stockCache = await readStockCache();
  const cachedTickerData = stockCache[ticker];
  const today = new Date().toISOString().split('T')[0];
  let rawData: StockDataPoint[];

  if (cachedTickerData && cachedTickerData.lastFetch === today) {
    console.log(`✅ [${ticker}] K-STOCK CACHE HIT: Loading raw data from cache file.`);
    rawData = cachedTickerData.data;
  } else {
    console.log(`❌ [${ticker}] K-STOCK CACHE MISS: Fetching new data from KIS API.`);
    try {
      rawData = await getDailyKoreanStockData(ticker); // 한국 주식 API 호출
      stockCache[ticker] = { lastFetch: today, data: rawData };
      await writeStockCache(stockCache);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred';
      console.error(`[K-Stock API Route - ${ticker}] Failed to fetch data:`, e);
      return NextResponse.json({ error: `Failed to load data for ${ticker}. Error: ${errorMessage}` }, { status: 500 });
    }
  }

  const dataWithIndicators = calculateBollingerBands(calculateRSI(rawData));
  const signals = analyzeAllTradingSignals(dataWithIndicators);
  return NextResponse.json({ data: dataWithIndicators, signals: signals });
}
