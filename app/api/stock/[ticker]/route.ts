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

interface AlphaVantageResponse {
  'Time Series (Daily)'?: {
    [date: string]: {
      '1. open': string;
      '2. high': string;
      '3. low': string;
      '4. close': string;
      '6. volume': string;
    };
  };
  'Note'?: string;
  'Error Message'?: string;
}

/* [수정] 모든 주석 형식을 통일합니다. */
const API_KEYS = [
  process.env.ALPHA_VANTAGE_API_KEY_1,
  process.env.ALPHA_VANTAGE_API_KEY_2,
  process.env.ALPHA_VANTAGE_API_KEY_3,
].filter(Boolean) as string[];

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

    if (API_KEYS.length === 0) {
      return NextResponse.json({ error: "설정된 Alpha Vantage API 키가 없습니다. .env 파일을 확인하세요." }, { status: 500 });
    }

    let successfulData: AlphaVantageResponse | null = null;
    let lastError: string = "모든 API 키를 사용했지만 데이터를 가져오지 못했습니다.";

    for (const apiKey of API_KEYS) {
      try {
        console.log(`[${ticker}] API Key ...${apiKey.slice(-4)}로 데이터 조회 시도...`);
        const response = await fetch(
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${apiKey}`
        );
          if (!response.ok) throw new Error(`API 서버 오류! Status: ${response.status}`);

          const data: AlphaVantageResponse = await response.json();

          if (data["Note"] && data["Note"].includes("API call frequency")) {
            lastError = `API 키(...${apiKey.slice(-4)})의 사용량을 초과했습니다.`;
            console.warn(`[${ticker}] ${lastError} 다음 키로 재시도합니다.`);
            continue; 
          }

          if (data["Error Message"]) {
            lastError = `API 오류: ${data["Error Message"]}`;
            throw new Error(lastError);
          }

          if (data['Time Series (Daily)']) {
            console.log(`✅ [${ticker}] Key ...${apiKey.slice(-4)}로 데이터 조회 성공!`);
            successfulData = data;
            break; 
          }

      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : '알 수 없는 오류 발생';
        console.error(`[API Route - ${ticker}] 현재 키로 조회 실패:`, lastError);
        break;
      }
    }

    if (successfulData && successfulData['Time Series (Daily)']) {
      const timeSeries = successfulData['Time Series (Daily)'];
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
      console.error(`[API Route - ${ticker}] 모든 API 키 시도 실패. 최종 오류: ${lastError}`);
      return NextResponse.json({ error: `'${ticker}' 데이터를 불러오는 데 실패했습니다. 최종 원인: ${lastError}` }, { status: 500 });
    }
  }

  const dataWithIndicators = calculateBollingerBands(calculateRSI(rawData));
  const signals = analyzeAllTradingSignals(dataWithIndicators);
  return NextResponse.json({ data: dataWithIndicators, signals: signals });
}
