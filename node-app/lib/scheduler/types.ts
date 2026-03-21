import { TradingSignal } from "../stockUtils";

export type StockSignalInfo = {
  name: string;
  currentSignal: TradingSignal;
  lastMeaningfulSignal: TradingSignal | undefined;
};
