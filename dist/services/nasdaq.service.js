"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsStocks = getAllUsStocks;
const NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedUsStocks = null;
function getEmptyQuote(symbol, name, exchange) {
    return {
        market: "US",
        currency: "USD",
        exchange,
        symbol,
        name,
        open: null,
        high: null,
        low: null,
        close: null,
        change: null,
        tradeVolume: 0,
        tradeValue: 0,
        transaction: 0,
    };
}
function normalizeUsListSymbol(symbol) {
    return symbol.trim().toUpperCase().replaceAll("/", "-");
}
function getExchangeName(exchangeCode) {
    const exchangeMap = {
        A: "NYSE American",
        N: "NYSE",
        P: "NYSE Arca",
        Q: "NASDAQ",
        G: "NASDAQ",
        S: "NASDAQ",
        Z: "BATS",
        V: "IEX",
    };
    return exchangeMap[exchangeCode] ?? exchangeCode;
}
async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch Nasdaq symbol directory");
    }
    return response.text();
}
function parseNasdaqListed(text) {
    return text
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("File Creation Time"))
        .map((line) => line.split("|"))
        .filter((columns) => columns[3] === "N")
        .map((columns) => getEmptyQuote(normalizeUsListSymbol(columns[0] ?? ""), columns[1] ?? "", getExchangeName(columns[2] ?? "Q")))
        .filter((stock) => stock.symbol && stock.name);
}
function parseOtherListed(text) {
    return text
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("File Creation Time"))
        .map((line) => line.split("|"))
        .filter((columns) => columns[6] === "N")
        .map((columns) => getEmptyQuote(normalizeUsListSymbol(columns[0] ?? ""), columns[1] ?? "", getExchangeName(columns[2] ?? "")))
        .filter((stock) => stock.symbol && stock.name);
}
async function getAllUsStocks() {
    if (cachedUsStocks && cachedUsStocks.expiresAt > Date.now()) {
        return cachedUsStocks.data;
    }
    const [nasdaqText, otherText] = await Promise.all([
        fetchText(NASDAQ_LISTED_URL),
        fetchText(OTHER_LISTED_URL),
    ]);
    const stocksBySymbol = new Map();
    [...parseNasdaqListed(nasdaqText), ...parseOtherListed(otherText)].forEach((stock) => {
        stocksBySymbol.set(stock.symbol, stock);
    });
    const data = [...stocksBySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    cachedUsStocks = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
    };
    return data;
}
