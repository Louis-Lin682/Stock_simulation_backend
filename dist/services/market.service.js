"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMarket = normalizeMarket;
exports.getMarketConfig = getMarketConfig;
exports.normalizeSymbol = normalizeSymbol;
exports.isSupportedStockSymbol = isSupportedStockSymbol;
exports.getMarketStocks = getMarketStocks;
exports.getMarketStockBySymbol = getMarketStockBySymbol;
exports.getMarketStockHistory = getMarketStockHistory;
exports.getMarketStockHistoryRange = getMarketStockHistoryRange;
const yahoo_finance_service_js_1 = require("./yahoo-finance.service.js");
const nasdaq_service_js_1 = require("./nasdaq.service.js");
const twse_service_js_1 = require("./twse.service.js");
function normalizeMarket(value) {
    const normalized = value?.toUpperCase();
    if (normalized === "TW" || normalized === "US") {
        return normalized;
    }
    return null;
}
function getMarketConfig(market) {
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
function normalizeSymbol(market, symbol) {
    return symbol.trim().toUpperCase();
}
function isSupportedStockSymbol(market, symbol) {
    if (market === "US") {
        return (0, yahoo_finance_service_js_1.isSupportedUsStockSymbol)(symbol);
    }
    return /^[0-9A-Z]{4,8}$/.test(symbol);
}
async function getMarketStocks(market) {
    if (market === "US") {
        return (0, nasdaq_service_js_1.getAllUsStocks)();
    }
    return (0, twse_service_js_1.getAllStocks)();
}
async function getMarketStockBySymbol(market, symbol) {
    if (market === "US") {
        return (0, yahoo_finance_service_js_1.getUsStockBySymbol)(symbol);
    }
    const stock = await (0, twse_service_js_1.getStockBySymbol)(symbol);
    if (!stock) {
        return null;
    }
    return {
        ...stock,
        market: "TW",
        currency: "TWD",
    };
}
async function getMarketStockHistory(market, symbol, date) {
    if (market === "US") {
        return (0, yahoo_finance_service_js_1.getUsStockHistoryRange)(symbol, 1);
    }
    return (0, twse_service_js_1.getStockHistory)(symbol, date);
}
async function getMarketStockHistoryRange(market, symbol, months) {
    if (market === "US") {
        return (0, yahoo_finance_service_js_1.getUsStockHistoryRange)(symbol, months);
    }
    return (0, twse_service_js_1.getStockHistoryRange)(symbol, months);
}
