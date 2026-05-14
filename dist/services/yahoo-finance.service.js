"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedUsStockSymbol = isSupportedUsStockSymbol;
exports.getUsStockBySymbol = getUsStockBySymbol;
exports.getUsStockHistoryRange = getUsStockHistoryRange;
const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
function isSupportedUsStockSymbol(symbol) {
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}
function getYahooSymbol(symbol) {
    return symbol.trim().toUpperCase();
}
function getResult(rawData) {
    const result = rawData.chart?.result?.[0];
    if (!result || rawData.chart?.error) {
        throw new Error("US_STOCK_NOT_FOUND");
    }
    return result;
}
async function getUsStockBySymbol(symbol) {
    const yahooSymbol = getYahooSymbol(symbol);
    const url = new URL(`${YAHOO_CHART_URL}/${yahooSymbol}`);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch US stock data");
    }
    const rawData = (await response.json());
    const result = getResult(rawData);
    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const lastIndex = (quote?.close?.length ?? 1) - 1;
    const previousClose = meta?.chartPreviousClose ?? null;
    const close = meta?.regularMarketPrice ?? quote?.close?.[lastIndex] ?? null;
    if (!meta?.symbol || close === null) {
        return null;
    }
    return {
        market: "US",
        currency: "USD",
        symbol: meta.symbol.toUpperCase(),
        name: meta.longName ?? meta.shortName ?? meta.symbol.toUpperCase(),
        open: quote?.open?.[lastIndex] ?? null,
        high: meta.regularMarketDayHigh ?? quote?.high?.[lastIndex] ?? null,
        low: meta.regularMarketDayLow ?? quote?.low?.[lastIndex] ?? null,
        close,
        change: previousClose === null ? null : close - previousClose,
        tradeVolume: meta.regularMarketVolume ?? quote?.volume?.[lastIndex] ?? 0,
        tradeValue: 0,
        transaction: 0,
    };
}
async function getUsStockHistoryRange(symbol, months) {
    const yahooSymbol = getYahooSymbol(symbol);
    const url = new URL(`${YAHOO_CHART_URL}/${yahooSymbol}`);
    url.searchParams.set("range", `${months}mo`);
    url.searchParams.set("interval", "1d");
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch US stock history");
    }
    const rawData = (await response.json());
    const result = getResult(rawData);
    const quote = result.indicators?.quote?.[0];
    if (!result.timestamp || !quote) {
        return [];
    }
    const history = [];
    result.timestamp.forEach((timestamp, index) => {
        const close = quote.close?.[index] ?? null;
        if (close === null) {
            return;
        }
        history.push({
            market: "US",
            date: new Date(timestamp * 1000).toISOString().slice(0, 10),
            tradeVolume: quote.volume?.[index] ?? 0,
            tradeValue: 0,
            open: quote.open?.[index] ?? null,
            high: quote.high?.[index] ?? null,
            low: quote.low?.[index] ?? null,
            close,
            change: null,
            transaction: 0,
        });
    });
    return history.sort((a, b) => a.date.localeCompare(b.date));
}
