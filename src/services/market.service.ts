import {
  getUsStockBySymbol,
  getUsStockHistoryRange,
  isSupportedUsStockSymbol,
} from "./yahoo-finance.service.js";
import { getAllUsStocks } from "./nasdaq.service.js";
import {
  getAllStocks,
  getStockBySymbol,
  getStockHistory,
  getStockHistoryRange,
} from "./twse.service.js";
import type { Market, StockHistoryItem, StockQuote } from "../types/stock.js";

export type MarketConfig = {
  market: Market;
  currency: "TWD" | "USD";
  initialCash: number;
};

export function normalizeMarket(value: string | undefined): Market | null {
  const normalized = value?.toUpperCase();

  if (normalized === "TW" || normalized === "US") {
    return normalized;
  }

  return null;
}

export function getMarketConfig(market: Market): MarketConfig {
  if (market === "US") {
    return {
      market,
      currency: "USD",
      initialCash: 100_000,
    };
  }

  return {
    market,
    currency: "TWD",
    initialCash: 1_000_000,
  };
}

export function normalizeSymbol(market: Market, symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function isSupportedStockSymbol(market: Market, symbol: string): boolean {
  if (market === "US") {
    return isSupportedUsStockSymbol(symbol);
  }

  return /^[0-9A-Z]{4,8}$/.test(symbol);
}

export async function getMarketStocks(market: Market): Promise<StockQuote[]> {
  if (market === "US") {
    return getAllUsStocks();
  }

  return getAllStocks();
}

export async function getMarketStockBySymbol(
  market: Market,
  symbol: string
): Promise<StockQuote | null> {
  if (market === "US") {
    return getUsStockBySymbol(symbol);
  }

  const stock = await getStockBySymbol(symbol);

  if (!stock) {
    return null;
  }

  return {
    ...stock,
    market: "TW",
    currency: "TWD",
  };
}

export async function getMarketStockHistory(
  market: Market,
  symbol: string,
  date: string
): Promise<StockHistoryItem[]> {
  if (market === "US") {
    return getUsStockHistoryRange(symbol, 1);
  }

  return getStockHistory(symbol, date);
}

export async function getMarketStockHistoryRange(
  market: Market,
  symbol: string,
  months: number
): Promise<StockHistoryItem[]> {
  if (market === "US") {
    return getUsStockHistoryRange(symbol, months);
  }

  return getStockHistoryRange(symbol, months);
}
