"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSupportedUsStockSymbol = isSupportedUsStockSymbol;
exports.getUsStockBySymbol = getUsStockBySymbol;
exports.getUsStockHistoryRange = getUsStockHistoryRange;
const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";
function getApiKey() {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("US_MARKET_API_KEY_MISSING");
    }
    return apiKey;
}
function toNumber(value) {
    if (!value) {
        return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}
function assertAlphaResponseIsUsable(rawData) {
    if (rawData.Note || rawData.Information) {
        throw new Error("US_MARKET_RATE_LIMITED");
    }
    if (rawData["Error Message"]) {
        throw new Error("US_STOCK_NOT_FOUND");
    }
}
function isSupportedUsStockSymbol(symbol) {
    return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}
async function getUsStockBySymbol(symbol) {
    const url = new URL(ALPHA_VANTAGE_URL);
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", getApiKey());
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch US stock data");
    }
    const rawData = (await response.json());
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
async function getUsStockHistoryRange(symbol, months) {
    const url = new URL(ALPHA_VANTAGE_URL);
    url.searchParams.set("function", "TIME_SERIES_DAILY");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("outputsize", "compact");
    url.searchParams.set("apikey", getApiKey());
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch US stock history");
    }
    const rawData = (await response.json());
    assertAlphaResponseIsUsable(rawData);
    const dailyData = rawData["Time Series (Daily)"];
    if (!dailyData) {
        return [];
    }
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return Object.entries(dailyData)
        .map(([date, values]) => ({
        market: "US",
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
