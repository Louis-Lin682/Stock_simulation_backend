"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllStocks = getAllStocks;
exports.getStockBySymbol = getStockBySymbol;
exports.getStockHistory = getStockHistory;
exports.getStockHistoryRange = getStockHistoryRange;
const number_js_1 = require("../utils/number.js");
const TWSE_STOCK_DAY_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TWSE_STOCK_DAY = "https://www.twse.com.tw/exchangeReport/STOCK_DAY";
function normalizeStock(row) {
    return {
        symbol: row.Code,
        name: row.Name,
        open: (0, number_js_1.toNumber)(row.OpeningPrice),
        high: (0, number_js_1.toNumber)(row.HighestPrice),
        low: (0, number_js_1.toNumber)(row.LowestPrice),
        close: (0, number_js_1.toNumber)(row.ClosingPrice),
        change: (0, number_js_1.toNumber)(row.Change),
        tradeVolume: (0, number_js_1.toNumber)(row.TradeVolume) ?? 0,
        tradeValue: (0, number_js_1.toNumber)(row.TradeValue) ?? 0,
        transaction: (0, number_js_1.toNumber)(row.Transaction) ?? 0,
    };
}
function rocDateToIsoDate(value) {
    const [rocYear, month, day] = value.split("/");
    return `${Number(rocYear) + 1911}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function normalizeStockHistoryRow(row) {
    return {
        date: rocDateToIsoDate(row[0]),
        tradeVolume: (0, number_js_1.toNumber)(row[1]) ?? 0,
        tradeValue: (0, number_js_1.toNumber)(row[2]) ?? 0,
        open: (0, number_js_1.toNumber)(row[3]),
        high: (0, number_js_1.toNumber)(row[4]),
        low: (0, number_js_1.toNumber)(row[5]),
        close: (0, number_js_1.toNumber)(row[6]),
        change: (0, number_js_1.toNumber)(row[7]),
        transaction: (0, number_js_1.toNumber)(row[8]) ?? 0,
    };
}
async function getAllStocks() {
    const response = await fetch(TWSE_STOCK_DAY_ALL);
    if (!response.ok) {
        throw new Error("Failed to fetch TWSE stock data");
    }
    const rawData = (await response.json());
    return rawData.map(normalizeStock);
}
async function getStockBySymbol(symbol) {
    const stocks = await getAllStocks();
    return stocks.find((stock) => stock.symbol === symbol) ?? null;
}
async function getStockHistory(symbol, date) {
    const url = new URL(TWSE_STOCK_DAY);
    url.searchParams.set("response", "json");
    url.searchParams.set("date", date);
    url.searchParams.set("stockNo", symbol);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Failed to fetch TWSE stock history");
    }
    const rawData = (await response.json());
    if (rawData.stat !== "OK") {
        return [];
    }
    if (!Array.isArray(rawData.data)) {
        return [];
    }
    return rawData.data.map(normalizeStockHistoryRow);
}
function formatHistoryMonth(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}${month}01`;
}
function getRecentHistoryMonths(months) {
    const dates = [];
    const now = new Date();
    for (let index = months - 1; index >= 0; index -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
        dates.push(formatHistoryMonth(date));
    }
    return dates;
}
async function getStockHistoryRange(symbol, months) {
    const dates = getRecentHistoryMonths(months);
    const monthlyHistories = await Promise.allSettled(dates.map((date) => getStockHistory(symbol, date)));
    return monthlyHistories
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .flat()
        .sort((a, b) => a.date.localeCompare(b.date));
}
