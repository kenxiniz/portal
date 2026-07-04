/* /lib/binanceApi.ts */
import axios from "axios";
import { StockDataPoint } from "./stockUtils";

const BINANCE_API_URL = "https://fapi.binance.com";

// Binance interval mapping
const INTERVAL_MAP: Record<string, string> = {
  "1d": "1d",
  "1h": "1h",
  "15m": "15m",
};

interface BinanceKline {
  0: number; // Open time
  1: string; // Open
  2: string; // High
  3: string; // Low
  4: string; // Close
  5: string; // Volume
  6: number; // Close time
}

/**
 * Fetch Binance Futures kline data
 * @param symbol - Trading pair (e.g., "BTCUSDT", "TSLAUSDT")
 * @param timeframe - "1d" | "1h" | "15m"
 * @param limit - Number of candles (max 1500)
 */
export async function getBinanceFuturesData(
  symbol: string,
  timeframe: string = "1d",
  limit: number = 500,
): Promise<StockDataPoint[]> {
  const interval = INTERVAL_MAP[timeframe] || "1d";

  try {
    const url = `${BINANCE_API_URL}/fapi/v1/klines`;
    const params = {
      symbol: symbol.toUpperCase(),
      interval,
      limit: Math.min(limit, 1500),
    };

    console.log(`[Binance API] Fetching ${symbol} ${interval} data...`);

    const response = await axios.get<BinanceKline[]>(url, { params });

    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error("No data returned from Binance API");
    }

    const data: StockDataPoint[] = response.data.map((kline: BinanceKline) => {
      const timestamp = kline[0];
      const date = new Date(timestamp);

      return {
        date:
          timeframe === "1d"
            ? date.toISOString().split("T")[0]
            : date
                .toISOString()
                .replace("Z", "")
                .replace("T", " ")
                .substring(0, 19),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      };
    });

    console.log(
      `[Binance API] Successfully fetched ${data.length} candles for ${symbol}`,
    );

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.msg || error.message;
      throw new Error(
        `Binance API error [${status}]: ${message} (Symbol: ${symbol})`,
      );
    }
    throw error;
  }
}

interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  quoteAsset: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceSymbolInfo[];
}

/**
 * Get available Binance Futures symbols
 */
export async function getBinanceSymbols(): Promise<string[]> {
  try {
    const url = `${BINANCE_API_URL}/fapi/v1/exchangeInfo`;
    const response = await axios.get<BinanceExchangeInfo>(url);

    const symbols = response.data.symbols
      .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
      .map((s) => s.symbol);

    return symbols;
  } catch (error) {
    console.error("[Binance API] Failed to fetch symbols:", error);
    return [];
  }
}
