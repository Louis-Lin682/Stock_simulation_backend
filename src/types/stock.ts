export type Market = "TW" | "US";

export type TwseStockRaw = {
  Code: string;
  Name: string;
  TradeVolume: string;
  TradeValue: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
  Transaction: string;
};

export type StockQuote = {
  market?: Market;
  currency?: string;
  exchange?: string;
  symbol: string;
  name: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  change: number | null;
  tradeVolume: number;
  tradeValue: number;
  transaction: number;
};

export type TwseStockHistoryRaw = {
  stat: string;
  date: string;
  title: string;
  fields: string[];
  data: string[][];
};

export type StockHistoryItem = {
  market?: Market;
  date: string;
  tradeVolume: number;
  tradeValue: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  change: number | null;
  transaction: number;
};
