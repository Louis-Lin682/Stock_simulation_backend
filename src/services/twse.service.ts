import type {
  StockHistoryItem,
  StockQuote,
  TwseStockHistoryRaw,
  TwseStockRaw,
} from "../types/stock.js";
import { toNumber } from "../utils/number.js";

const TWSE_STOCK_DAY_ALL =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";

const TWSE_STOCK_DAY =
  "https://www.twse.com.tw/exchangeReport/STOCK_DAY";

function normalizeStock(row: TwseStockRaw): StockQuote {
  return {
    symbol: row.Code,
    name: row.Name,
    open: toNumber(row.OpeningPrice),
    high: toNumber(row.HighestPrice),
    low: toNumber(row.LowestPrice),
    close: toNumber(row.ClosingPrice),
    change: toNumber(row.Change),
    tradeVolume: toNumber(row.TradeVolume) ?? 0,
    tradeValue: toNumber(row.TradeValue) ?? 0,
    transaction: toNumber(row.Transaction) ?? 0,
  };
}

function rocDateToIsoDate(value: string): string {
  const [rocYear, month, day] = value.split("/");

  return `${Number(rocYear) + 1911}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}`;
}

function normalizeStockHistoryRow(row: string[]): StockHistoryItem {
  return {
    date: rocDateToIsoDate(row[0]),
    tradeVolume: toNumber(row[1]) ?? 0,
    tradeValue: toNumber(row[2]) ?? 0,
    open: toNumber(row[3]),
    high: toNumber(row[4]),
    low: toNumber(row[5]),
    close: toNumber(row[6]),
    change: toNumber(row[7]),
    transaction: toNumber(row[8]) ?? 0,
  };
}

export async function getAllStocks(): Promise<StockQuote[]> {
  const response = await fetch(TWSE_STOCK_DAY_ALL);

  if (!response.ok) {
    throw new Error("Failed to fetch TWSE stock data");
  }

  const rawData = (await response.json()) as TwseStockRaw[];

  return rawData.map(normalizeStock);
}

export async function getStockBySymbol(
  symbol: string
): Promise<StockQuote | null> {
  const stocks = await getAllStocks();

  return stocks.find((stock) => stock.symbol === symbol) ?? null;
}

export async function getStockHistory(
  symbol: string,
  date: string
): Promise<StockHistoryItem[]> {
  const url = new URL(TWSE_STOCK_DAY);

  url.searchParams.set("response", "json");
  url.searchParams.set("date", date);
  url.searchParams.set("stockNo", symbol);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch TWSE stock history");
  }

  const rawData = (await response.json()) as TwseStockHistoryRaw;

  if (rawData.stat !== "OK") {
    return [];
  }

  if (!Array.isArray(rawData.data)) {
    return [];
  }

  return rawData.data.map(normalizeStockHistoryRow);
}

function formatHistoryMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}${month}01`;
}

function getRecentHistoryMonths(months: number): string[] {
  const dates: string[] = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    dates.push(formatHistoryMonth(date));
  }

  return dates;
}

export async function getStockHistoryRange(
  symbol: string,
  months: number
): Promise<StockHistoryItem[]> {
  const dates = getRecentHistoryMonths(months);

  const monthlyHistories = await Promise.allSettled(
    dates.map((date) => getStockHistory(symbol, date))
  );

  return monthlyHistories
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date));
}
