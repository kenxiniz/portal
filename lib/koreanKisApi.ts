/* /lib/koreanKisApi.ts */

import axios, { AxiosError } from 'axios';
import { StockDataPoint } from './stockUtils';

const KIS_API_URL = 'https://openapi.koreainvestment.com:9443';
const KIS_APP_KEY = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

interface KisStockItem {
  stck_bsop_date: string; /* 영업일자 */
  stck_oprc: string;      /* 시가 */
  stck_hgpr: string;      /* 고가 */
  stck_lwpr: string;      /* 저가 */
  stck_clpr: string;      /* 종가 */
  acml_vol: string;       /* 거래량 */
}

interface KisApiError {
  msg1?: string;
}

/*
 *  * * API 인증 토큰을 발급받거나 기존 토큰을 반환하는 함수
 *   * */
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
 *  * * 한국 주식 일별 데이터를 조회하는 함수 (페이지네이션 최적화 및 딜레이 추가)
 *   * */
export async function getDailyKoreanStockData(ticker: string): Promise<StockDataPoint[]> {
  const token = await getAccessToken();
  const allData: StockDataPoint[] = [];
  let endDate = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(endDate.getFullYear() - 2);

  while (endDate > twoYearsAgo) {
    let startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 100);
    if (startDate < twoYearsAgo) {
      startDate = twoYearsAgo;
    }

    const formattedStartDate = startDate.toISOString().slice(0, 10).replace(/-/g, '');
    const formattedEndDate = endDate.toISOString().slice(0, 10).replace(/-/g, '');

    const params = new URLSearchParams({
      'FID_COND_MRKT_DIV_CODE': 'J',
      'FID_INPUT_ISCD': ticker,
      'FID_INPUT_DATE_1': formattedStartDate,
      'FID_INPUT_DATE_2': formattedEndDate,
      'FID_PERIOD_DIV_CODE': 'D',
      'FID_ORG_ADJ_PRC': '1',
    }).toString();

    const url = `${KIS_API_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`;

    try {
      console.log(`Fetching K-Stock data for ${ticker} from ${formattedStartDate} to ${formattedEndDate}...`);
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${token}`,
          'appkey': KIS_APP_KEY,
          'appsecret': KIS_APP_SECRET,
          'tr_id': 'FHKST03010100',
        },
      });

      if (response.data.rt_cd !== '0') {
        throw new Error(response.data.msg1 || 'Failed to fetch data from KIS API');
      }

      const chunk: KisStockItem[] = response.data.output2;
      if (chunk.length > 0) {
        const mappedChunk = chunk.map((item: KisStockItem) => ({
          date: `${item.stck_bsop_date.substring(0, 4)}-${item.stck_bsop_date.substring(4, 6)}-${item.stck_bsop_date.substring(6, 8)}`,
          open: parseFloat(item.stck_oprc),
          high: parseFloat(item.stck_hgpr),
          low: parseFloat(item.stck_lwpr),
          close: parseFloat(item.stck_clpr),
          volume: parseFloat(item.acml_vol),
        }));
        allData.push(...mappedChunk);
      }

      /* 다음 요청을 위해 종료 날짜를 현재 기간의 시작일 바로 전날로 설정 */
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() - 1);

    } catch (error) {
      const axiosError = error as AxiosError<KisApiError>;
      const errorMessage = axiosError.response?.data?.msg1 || axiosError.message;
      console.error(`❌ Failed to fetch Korean daily data for ${ticker}:`, errorMessage);
      throw new Error(`Failed to fetch Korean daily data for ${ticker}: ${errorMessage}`);
    }

    /* [수정] API 속도 제한을 피하기 위해 각 요청 사이에 500ms 딜레이를 추가합니다. */
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const uniqueData = Array.from(new Map(allData.map(item => [item.date, item])).values());
  return uniqueData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
