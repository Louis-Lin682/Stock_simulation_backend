"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stocksRouter = void 0;
const express_1 = require("express");
const market_service_js_1 = require("../services/market.service.js");
const trading_calendar_service_js_1 = require("../services/trading-calendar.service.js");
exports.stocksRouter = (0, express_1.Router)();
function getDefaultDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}${month}01`;
}
exports.stocksRouter.get("/", async (_req, res) => {
    try {
        const market = (0, market_service_js_1.normalizeMarket)(typeof _req.query.market === "string" ? _req.query.market : "TW");
        if (!market) {
            return res.status(400).json({
                message: "market must be TW or US",
            });
        }
        const stocks = await (0, market_service_js_1.getMarketStocks)(market);
        res.json({
            source: market === "TW" ? "TWSE" : "Nasdaq Trader",
            market,
            count: stocks.length,
            data: stocks,
        });
    }
    catch {
        res.status(502).json({
            message: "Failed to fetch stock list",
        });
    }
});
exports.stocksRouter.get("/calendar", async (req, res) => {
    try {
        const market = (0, market_service_js_1.normalizeMarket)(typeof req.query.market === "string" ? req.query.market : "TW");
        if (!market) {
            return res.status(400).json({
                message: "market must be TW or US",
            });
        }
        const yearValue = typeof req.query.year === "string" ? Number(req.query.year) : new Date().getFullYear();
        if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100) {
            return res.status(400).json({
                message: "year must be an integer between 2000 and 2100",
            });
        }
        const calendar = await (0, trading_calendar_service_js_1.getMarketCalendar)(market, yearValue);
        res.json(calendar);
    }
    catch {
        res.status(502).json({
            message: "Failed to fetch market calendar",
        });
    }
});
exports.stocksRouter.get("/:market/:symbol/history/range", async (req, res) => {
    try {
        const market = (0, market_service_js_1.normalizeMarket)(req.params.market);
        if (!market) {
            return res.status(400).json({
                message: "market must be TW or US",
            });
        }
        const symbol = (0, market_service_js_1.normalizeSymbol)(market, req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)(market, symbol)) {
            return res.status(400).json({
                message: "symbol is not supported for this market",
            });
        }
        const monthsValue = typeof req.query.months === "string" ? Number(req.query.months) : 6;
        if (!Number.isInteger(monthsValue) ||
            monthsValue <= 0 ||
            monthsValue > 24) {
            return res.status(400).json({
                message: "months must be an integer between 1 and 24",
            });
        }
        const history = await (0, market_service_js_1.getMarketStockHistoryRange)(market, symbol, monthsValue);
        res.json({
            source: market === "TW" ? "TWSE" : "Yahoo Finance",
            market,
            symbol,
            months: monthsValue,
            count: history.length,
            data: history,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === "US_MARKET_API_KEY_MISSING") {
            return res.status(503).json({
                message: "US market data API key is missing",
            });
        }
        if (error instanceof Error && error.message === "US_MARKET_RATE_LIMITED") {
            return res.status(429).json({
                message: "US market data rate limit reached",
            });
        }
        res.status(502).json({
            message: "Failed to fetch stock history range",
        });
    }
});
exports.stocksRouter.get("/:market/:symbol/history", async (req, res) => {
    try {
        const market = (0, market_service_js_1.normalizeMarket)(req.params.market);
        if (!market) {
            return res.status(400).json({
                message: "market must be TW or US",
            });
        }
        const symbol = (0, market_service_js_1.normalizeSymbol)(market, req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)(market, symbol)) {
            return res.status(400).json({
                message: "symbol is not supported for this market",
            });
        }
        const date = typeof req.query.date === "string" ? req.query.date : getDefaultDate();
        if (market === "TW" && !/^\d{8}$/.test(date)) {
            return res.status(400).json({
                message: "date must be YYYYMMDD",
            });
        }
        const history = await (0, market_service_js_1.getMarketStockHistory)(market, symbol, date);
        res.json({
            source: market === "TW" ? "TWSE" : "Alpha Vantage",
            market,
            symbol,
            date,
            count: history.length,
            data: history,
        });
    }
    catch (error) {
        if (error instanceof Error && error.message === "US_MARKET_API_KEY_MISSING") {
            return res.status(503).json({
                message: "US market data API key is missing",
            });
        }
        res.status(502).json({
            message: "Failed to fetch stock history",
        });
    }
});
exports.stocksRouter.get("/:market/:symbol", async (req, res) => {
    try {
        const market = (0, market_service_js_1.normalizeMarket)(req.params.market);
        if (!market) {
            return res.status(400).json({
                message: "market must be TW or US",
            });
        }
        const symbol = (0, market_service_js_1.normalizeSymbol)(market, req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)(market, symbol)) {
            return res.status(400).json({
                message: "symbol is not supported for this market",
            });
        }
        const stock = await (0, market_service_js_1.getMarketStockBySymbol)(market, symbol);
        if (!stock) {
            return res.status(404).json({
                message: "Stock not found",
            });
        }
        res.json(stock);
    }
    catch (error) {
        if (error instanceof Error && error.message === "US_MARKET_API_KEY_MISSING") {
            return res.status(503).json({
                message: "US market data API key is missing",
            });
        }
        if (error instanceof Error && error.message === "US_MARKET_RATE_LIMITED") {
            return res.status(429).json({
                message: "US market data rate limit reached",
            });
        }
        res.status(502).json({
            message: "Failed to fetch stock data",
        });
    }
});
exports.stocksRouter.get("/:symbol/history/range", async (req, res) => {
    try {
        const symbol = (0, market_service_js_1.normalizeSymbol)("TW", req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)("TW", symbol)) {
            return res.status(400).json({
                message: "symbol must be a Taiwan stock code",
            });
        }
        const monthsValue = typeof req.query.months === "string" ? Number(req.query.months) : 6;
        if (!Number.isInteger(monthsValue) ||
            monthsValue <= 0 ||
            monthsValue > 24) {
            return res.status(400).json({
                message: "months must be an integer between 1 and 24",
            });
        }
        const history = await (0, market_service_js_1.getMarketStockHistoryRange)("TW", symbol, monthsValue);
        res.json({
            source: "TWSE",
            market: "TW",
            symbol,
            months: monthsValue,
            count: history.length,
            data: history,
        });
    }
    catch {
        res.status(502).json({
            message: "Failed to fetch TWSE stock history range",
        });
    }
});
exports.stocksRouter.get("/:symbol/history", async (req, res) => {
    try {
        const symbol = (0, market_service_js_1.normalizeSymbol)("TW", req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)("TW", symbol)) {
            return res.status(400).json({
                message: "symbol must be a Taiwan stock code",
            });
        }
        const date = typeof req.query.date === "string" ? req.query.date : getDefaultDate();
        if (!/^\d{8}$/.test(date)) {
            return res.status(400).json({
                message: "date must be YYYYMMDD",
            });
        }
        const history = await (0, market_service_js_1.getMarketStockHistory)("TW", symbol, date);
        res.json({
            source: "TWSE",
            market: "TW",
            symbol,
            date,
            count: history.length,
            data: history,
        });
    }
    catch {
        res.status(502).json({
            message: "Failed to fetch TWSE stock history",
        });
    }
});
exports.stocksRouter.get("/:symbol", async (req, res) => {
    try {
        const symbol = (0, market_service_js_1.normalizeSymbol)("TW", req.params.symbol);
        if (!(0, market_service_js_1.isSupportedStockSymbol)("TW", symbol)) {
            return res.status(400).json({
                message: "symbol must be a Taiwan stock code",
            });
        }
        const stock = await (0, market_service_js_1.getMarketStockBySymbol)("TW", symbol);
        if (!stock) {
            return res.status(404).json({
                message: "Stock not found",
            });
        }
        res.json(stock);
    }
    catch {
        res.status(502).json({
            message: "Failed to fetch TWSE stock data",
        });
    }
});
