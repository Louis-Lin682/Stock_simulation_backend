import type { StockHistoryItem, StockQuote } from "../types/stock.js";

const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

type AlphaGlobalQuoteRaw = {
  "Global Quote"?: {
    "01. symbol"?: string;
    "02. open"?: string;
    "03. high"?: string;
    "04. low"?: string;
    "05. price"?: string;
    "06. volume"?: string;
    "09. change"?: string;
  };
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

type AlphaDailyRaw = {
  "Time Series (Daily)"?: Record<
    string,
    {
      "1. open": string;
      "2. high": string;
      "3. low": string;
      "4. close": string;
      "5. volume": string;
    }
  >;
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

function getApiKey(): string {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("US_MARKET_API_KEY_MISSING");
  }

  return apiKey;
}

function toNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function assertAlphaResponseIsUsable(
  rawData: AlphaGlobalQuoteRaw | AlphaDailyRaw
) {
  if (rawData.Note || rawData.Information) {
    throw new Error("US_MARKET_RATE_LIMITED");
  }

  if (rawData["Error Message"]) {
    throw new Error("US_STOCK_NOT_FOUND");
  }
}

export function isSupportedUsStockSymbol(symbol: string): boolean {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}

export async function getUsStockBySymbol(
  symbol: string
): Promise<StockQuote | null> {
  const url = new URL(ALPHA_VANTAGE_URL);

  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", getApiKey());

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch US stock data");
  }

  const rawData = (await response.json()) as AlphaGlobalQuoteRaw;
  assertAlphaResponseIsUsable(rawData);

  const quote = rawData["Global Quote"];

  if (!quote?.["01. symbol"] || !quote["05. price"]) {
    return null;
  }

  return {
    market: "US",
    currency: "USD",
    symbol: quote["01. symbol"].toUpperCase(),
    name: quote["01. symbol"].toUpperCase(),
    open: toNumber(quote["02. open"]),
    high: toNumber(quote["03. high"]),
    low: toNumber(quote["04. low"]),
    close: toNumber(quote["05. price"]),
    change: toNumber(quote["09. change"]),
    tradeVolume: toNumber(quote["06. volume"]) ?? 0,
    tradeValue: 0,
    transaction: 0,
  };
}

export async function getUsStockHistoryRange(
  symbol: string,
  months: number
): Promise<StockHistoryItem[]> {
  const url = new URL(ALPHA_VANTAGE_URL);

  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", getApiKey());

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch US stock history");
  }

  const rawData = (await response.json()) as AlphaDailyRaw;
  assertAlphaResponseIsUsable(rawData);

  const dailyData = rawData["Time Series (Daily)"];

  if (!dailyData) {
    return [];
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  return Object.entries(dailyData)
    .map(([date, values]) => ({
      market: "US" as const,
      date,
      tradeVolume: toNumber(values["5. volume"]) ?? 0,
      tradeValue: 0,
      open: toNumber(values["1. open"]),
      high: toNumber(values["2. high"]),
      low: toNumber(values["3. low"]),
      close: toNumber(values["4. close"]),
      change: null,
      transaction: 0,
    }))
    .filter((item) => new Date(item.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}
