/* /lib/binanceWebSocket.ts */

export interface BinanceKlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BinanceKlineEvent {
  e: string;
  E: number;
  s: string;
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

const BINANCE_WS_URL = "wss://fstream.binance.com/market/ws";

// Interval mapping
const INTERVAL_MAP: Record<string, string> = {
  "1d": "1d",
  "1h": "1h",
  "15m": "15m",
};

export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private symbol: string;
  private interval: string;
  private onUpdate: (data: BinanceKlineData) => void;
  private onError: (error: Event) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private isIntentionallyClosed = false;

  constructor(
    symbol: string,
    timeframe: string,
    onUpdate: (data: BinanceKlineData) => void,
    onError?: (error: Event) => void,
  ) {
    this.symbol = symbol.toLowerCase();
    this.interval = INTERVAL_MAP[timeframe] || "1d";
    this.onUpdate = onUpdate;
    this.onError = onError || (() => {});
  }

  connect() {
    if (typeof window === "undefined") {
      console.warn("[Binance WS] WebSocket not available in SSR");
      return;
    }

    const streamName = `${this.symbol}@kline_${this.interval}`;
    const wsUrl = `${BINANCE_WS_URL}/${streamName}`;

    console.log(`[Binance WS] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Binance WS] Connected: ${streamName}`);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          console.log(
            `[Binance WS] Raw message received:`,
            event.data.substring(0, 200),
          );
          const data: BinanceKlineEvent = JSON.parse(event.data);
          console.log(
            `[Binance WS] Parsed event type: ${data.e}, symbol: ${data.s}`,
          );

          if (data.e === "kline" && data.k) {
            console.log(
              `[Binance WS] Kline data - close: ${data.k.c}, time: ${new Date(data.k.t).toISOString()}, isClosed: ${data.k.x}`,
            );
            const klineData: BinanceKlineData = {
              time: data.k.t,
              open: parseFloat(data.k.o),
              high: parseFloat(data.k.h),
              low: parseFloat(data.k.l),
              close: parseFloat(data.k.c),
              volume: parseFloat(data.k.v),
            };

            console.log(`[Binance WS] Calling onUpdate callback...`);
            this.onUpdate(klineData);
          } else {
            console.log(`[Binance WS] Non-kline event or missing k field`);
          }
        } catch (error) {
          console.error("[Binance WS] Parse error:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[Binance WS] Error:", error);
        this.onError(error);
      };

      this.ws.onclose = (event) => {
        console.log(`[Binance WS] Disconnected: ${event.code} ${event.reason}`);

        if (!this.isIntentionallyClosed && this.shouldReconnect()) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("[Binance WS] Connection error:", error);
    }
  }

  private shouldReconnect(): boolean {
    return this.reconnectAttempts < this.maxReconnectAttempts;
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `[Binance WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    this.isIntentionallyClosed = true;

    if (this.ws) {
      console.log("[Binance WS] Disconnecting...");
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a Binance WebSocket client for real-time kline data
 */
export function createBinanceWebSocket(
  symbol: string,
  timeframe: string,
  onUpdate: (data: BinanceKlineData) => void,
  onError?: (error: Event) => void,
): BinanceWebSocketClient {
  return new BinanceWebSocketClient(symbol, timeframe, onUpdate, onError);
}
