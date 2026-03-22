import { TradingSignal } from "../stockUtils";

/**
 * Detailed structure for Gemini AI advice.
 */
export interface AIAdvice {
  action?: string; // BUY, SELL, HOLD, etc.
  message: string; // The actual insight/reasoning text
  error: boolean;
}

export interface StockSignalInfo {
  name: string;
  currentSignal: TradingSignal;
  lastMeaningfulSignal?: TradingSignal;
  /**
   * AI-generated investment advice from Gemini.
   */
  advice?: AIAdvice;
}
