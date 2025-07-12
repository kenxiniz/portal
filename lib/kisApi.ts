/* /lib/kisApi.ts */

import axios, { AxiosError } from 'axios';
import { StockDataPoint } from './stockUtils';
import stockConfig from './stock.json';

const KIS_API_URL = 'https://openapi.koreainvestment.com:9443';
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

interface KisStockItem {
  xymd: string;
  open: string;
  high: string;
  low: string;
  clos: string;
  tvol: string;
}

interface KisApiError {
  msg1?: string;
}

/*
 *  * API 인증 토큰을 발급받거나 기존 토큰을 반환하는 함수
 *   */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
    return accessToken;
  }

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    throw new Error('KIS_APP_KEY and KIS_APP_SECRET must be set');
  }

  try {
    const response = await axios.post(`${KIS_API_URL}/oauth2/tokenP`, {
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    });

    accessToken = response.data.access_token;
    /* 토큰 만료 시간 1분 전으로 설정 */
    tokenExpiresAt = now + (response.data.expires_in - 60) * 1000;

    console.log('✅ KIS Access Token has been issued successfully.');
    return accessToken!;
  } catch (error) {
    console.error('❌ Failed to get KIS access token:', error);
    throw new Error('Failed to get KIS access token');
  }
}

/*
 *  * 페이지네이션을 구현하여 2년치 데이터를 모두 가져오는 함수
 *   */
async function getDailyOverseasStockData(ticker: string, exchange: string): Promise<StockDataPoint[]> {
  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];
  let currentBymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let continueFetching = true;

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  while (continueFetching) {
    const params = new URLSearchParams({
      'AUTH': '',
      'EXCD': exchange,
      'SYMB': ticker,
      'GUBN': '0',
      'BYMD': currentBymd,
      'MODP': '1',
    }).toString();

    const url = `${KIS_API_URL}/uapi/overseas-price/v1/quotations/dailyprice?${params}`;

    try {
      console.log(`Fetching data for ${ticker} (EXCD: ${exchange}) until ${currentBymd}...`);
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${token}`,
          'appkey': KIS_APP_KEY,
          'appsecret': KIS_APP_SECRET,
          'tr_id': 'HHDFS76240000',
        },
      });

      if (response.data.rt_cd !== '0') {
        throw new Error(response.data.msg1 || 'Failed to fetch data from KIS API');
      }

      const chunk = response.data.output2.map((item: KisStockItem) => ({
        date: `${item.xymd.substring(0, 4)}-${item.xymd.substring(4, 6)}-${item.xymd.substring(6, 8)}`,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.clos),
        volume: parseFloat(item.tvol),
      }));

      if (chunk.length === 0) {
        continueFetching = false;
        break;
      }

      allData.push(...chunk);

      const lastDateStr = chunk[chunk.length - 1].date;
      const lastDate = new Date(lastDateStr);

      if (lastDate <= twoYearsAgo) {
        continueFetching = false;
      } else {
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() - 1);
        currentBymd = nextDate.toISOString().slice(0, 10).replace(/-/g, '');
      }

    } catch (error) {
      const axiosError = error as AxiosError<KisApiError>;
      const errorMessage = axiosError.response?.data?.msg1 || axiosError.message;
      console.error(`❌ Failed to fetch overseas daily data for ${ticker} (EXCD: ${exchange}):`, errorMessage);
      throw new Error(`Failed to fetch overseas daily data for ${ticker} (EXCD: ${exchange}): ${errorMessage}`);
    }
  }

  const uniqueData = Array.from(new Map(allData.map(item => [item.date, item])).values());
  return uniqueData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/*
 *  * 종목 정보를 stock.json에서 찾아 API를 호출하는 통합 함수
 *   */
export async function getDailyStockData(ticker: string): Promise<StockDataPoint[]> {
  const stockInfo = stockConfig.tickers.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());

  if (stockInfo) {
    return getDailyOverseasStockData(stockInfo.ticker, stockInfo.exchange);
  } else {
    throw new Error(`Ticker ${ticker} is not defined in stock.json.`);
  }
}
