"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portfolioRouter = void 0;
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const market_service_js_1 = require("../services/market.service.js");
const order_sync_service_js_1 = require("../services/order-sync.service.js");
exports.portfolioRouter = (0, express_1.Router)();
async function getOrCreateAccount(userId, currency) {
    const existing = await prisma_js_1.prisma.account.findUnique({
        where: {
            userId_currency: {
                userId,
                currency,
            },
        },
    });
    if (existing) {
        return existing;
    }
    return prisma_js_1.prisma.account.create({
        data: {
            userId,
            currency,
            cash: 0,
        },
    });
}
async function getOrCreateBankAccount(userId, currency) {
    const existing = await prisma_js_1.prisma.bankAccount.findUnique({
        where: {
            userId_currency: {
                userId,
                currency,
            },
        },
    });
    if (existing) {
        return existing;
    }
    return prisma_js_1.prisma.bankAccount.create({
        data: {
            userId,
            currency,
            cash: 0,
        },
    });
}
function normalizeTransferAmount(currency, value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    if (amount > 1_000_000_000) {
        return null;
    }
    return currency === "TWD"
        ? Math.round(amount)
        : Math.round(amount * 100) / 100;
}
function normalizeTransferDirection(value) {
    if (value === "BANK_TO_BROKER" || value === "BROKER_TO_BANK") {
        return value;
    }
    return null;
}
exports.portfolioRouter.get("/", auth_js_1.requireAuth, async (req, res) => {
    try {
        const { userId } = req;
        await (0, order_sync_service_js_1.syncPendingOrders)(userId);
        const twdAccount = await getOrCreateAccount(userId, "TWD");
        const usdAccount = await getOrCreateAccount(userId, "USD");
        const twdBankAccount = await getOrCreateBankAccount(userId, "TWD");
        const usdBankAccount = await getOrCreateBankAccount(userId, "USD");
        const holdings = await prisma_js_1.prisma.holding.findMany({
            where: {
                userId,
            },
            orderBy: {
                symbol: "asc",
            },
        });
        const orders = await prisma_js_1.prisma.order.findMany({
            where: {
                userId,
            },
        });
        const enrichedHoldings = await Promise.all(holdings.map(async (holding) => {
            const latestStock = await (0, market_service_js_1.getMarketStockBySymbol)(holding.market === "US" ? "US" : "TW", holding.symbol).catch(() => null);
            const latestPrice = latestStock?.close ?? null;
            // costValue is the user's book cost. marketValue is recalculated
            // from each market's latest close every time the portfolio endpoint is read.
            const costValue = holding.averageCost * holding.quantity;
            const marketValue = latestPrice === null ? costValue : latestPrice * holding.quantity;
            const unrealizedPnL = marketValue - costValue;
            const unrealizedPnLPercent = costValue === 0 ? 0 : (unrealizedPnL / costValue) * 100;
            return {
                id: holding.id,
                market: holding.market,
                currency: holding.currency,
                symbol: holding.symbol,
                name: holding.name,
                quantity: holding.quantity,
                reservedQuantity: holding.reservedQuantity,
                availableQuantity: holding.quantity - holding.reservedQuantity,
                averageCost: holding.averageCost,
                latestPrice,
                costValue,
                marketValue,
                unrealizedPnL,
                unrealizedPnLPercent,
                createdAt: holding.createdAt,
                updatedAt: holding.updatedAt,
            };
        }));
        const totalsByCurrency = ["TWD", "USD"].map((currency) => {
            const account = currency === "USD" ? usdAccount : twdAccount;
            const bankAccount = currency === "USD" ? usdBankAccount : twdBankAccount;
            const currencyHoldings = enrichedHoldings.filter((holding) => holding.currency === currency);
            const currencyOrders = orders.filter((order) => order.currency === currency);
            const pendingOrders = currencyOrders.filter((order) => order.status === "PENDING");
            const costValue = currencyHoldings.reduce((sum, holding) => {
                return sum + holding.costValue;
            }, 0);
            const marketValue = currencyHoldings.reduce((sum, holding) => {
                return sum + holding.marketValue;
            }, 0);
            const unrealizedPnL = marketValue - costValue;
            const unrealizedPnLPercent = costValue === 0 ? 0 : (unrealizedPnL / costValue) * 100;
            const realizedPnL = currencyOrders.reduce((sum, order) => {
                return sum + (order.realizedPnL ?? 0);
            }, 0);
            const cumulativeFee = currencyOrders.reduce((sum, order) => {
                return sum + (order.fee ?? 0);
            }, 0);
            const cumulativeTax = currencyOrders.reduce((sum, order) => {
                return sum + (order.tax ?? 0);
            }, 0);
            const pendingBuyAmount = pendingOrders
                .filter((order) => order.side === "BUY")
                .reduce((sum, order) => sum + (order.netAmount > 0 ? order.netAmount : order.amount), 0);
            const pendingSellQuantity = pendingOrders
                .filter((order) => order.side === "SELL")
                .reduce((sum, order) => sum + order.quantity, 0);
            const returnBase = costValue + cumulativeFee + cumulativeTax;
            const totalPnL = realizedPnL + unrealizedPnL;
            const totalReturnPercent = returnBase === 0 ? 0 : (totalPnL / returnBase) * 100;
            return {
                currency,
                cash: account.cash,
                bankCash: bankAccount.cash,
                reservedCash: account.reservedCash,
                costValue,
                marketValue,
                totalValue: bankAccount.cash + account.cash + account.reservedCash + marketValue,
                unrealizedPnL,
                unrealizedPnLPercent,
                realizedPnL,
                totalPnL,
                totalReturnPercent,
                cumulativeFee,
                cumulativeTax,
                pendingOrderCount: pendingOrders.length,
                pendingBuyAmount,
                pendingSellQuantity,
            };
        });
        const twdTotals = totalsByCurrency.find((item) => item.currency === "TWD");
        res.json({
            accounts: [
                {
                    currency: "TWD",
                    cash: twdAccount.cash,
                    reservedCash: twdAccount.reservedCash,
                },
                {
                    currency: "USD",
                    cash: usdAccount.cash,
                    reservedCash: usdAccount.reservedCash,
                },
            ],
            bankAccounts: [
                {
                    currency: "TWD",
                    cash: twdBankAccount.cash,
                },
                {
                    currency: "USD",
                    cash: usdBankAccount.cash,
                },
            ],
            totalsByCurrency,
            cash: twdTotals.cash,
            holdings: enrichedHoldings,
            costValue: twdTotals.costValue,
            marketValue: twdTotals.marketValue,
            totalValue: twdTotals.totalValue,
            unrealizedPnL: twdTotals.unrealizedPnL,
            unrealizedPnLPercent: twdTotals.unrealizedPnLPercent,
        });
    }
    catch {
        res.status(500).json({
            message: "Failed to load portfolio",
        });
    }
});
exports.portfolioRouter.post("/transfer", auth_js_1.requireAuth, async (req, res) => {
    try {
        const { userId } = req;
        const currency = req.body?.currency === "USD" ? "USD" : "TWD";
        const direction = normalizeTransferDirection(req.body?.direction);
        const amount = normalizeTransferAmount(currency, req.body?.amount);
        if (!direction) {
            return res.status(400).json({
                message: "transfer direction is invalid",
            });
        }
        if (amount === null) {
            return res.status(400).json({
                message: "transfer amount must be greater than 0",
            });
        }
        const result = await prisma_js_1.prisma.$transaction(async (tx) => {
            const existingBrokerAccount = await tx.account.findUnique({
                where: {
                    userId_currency: {
                        userId,
                        currency,
                    },
                },
            });
            const existingBankAccount = await tx.bankAccount.findUnique({
                where: {
                    userId_currency: {
                        userId,
                        currency,
                    },
                },
            });
            const brokerAccount = existingBrokerAccount ??
                (await tx.account.create({
                    data: {
                        userId,
                        currency,
                        cash: 0,
                    },
                }));
            const bankAccount = existingBankAccount ??
                (await tx.bankAccount.create({
                    data: {
                        userId,
                        currency,
                        cash: 0,
                    },
                }));
            const brokerCashBefore = brokerAccount.cash;
            const bankCashBefore = bankAccount.cash;
            let brokerCashAfter = brokerCashBefore;
            let bankCashAfter = bankCashBefore;
            if (direction === "BANK_TO_BROKER") {
                if (bankCashBefore < amount) {
                    throw new Error("INSUFFICIENT_BANK_CASH");
                }
                bankCashAfter = bankCashBefore - amount;
                brokerCashAfter = brokerCashBefore + amount;
            }
            else {
                if (brokerCashBefore < amount) {
                    throw new Error("INSUFFICIENT_BROKER_CASH");
                }
                brokerCashAfter = brokerCashBefore - amount;
                bankCashAfter = bankCashBefore + amount;
            }
            const updatedBrokerAccount = await tx.account.update({
                where: {
                    id: brokerAccount.id,
                },
                data: {
                    cash: brokerCashAfter,
                },
            });
            const updatedBankAccount = await tx.bankAccount.update({
                where: {
                    id: bankAccount.id,
                },
                data: {
                    cash: bankCashAfter,
                },
            });
            const transaction = await tx.cashTransaction.create({
                data: {
                    userId,
                    currency,
                    type: direction,
                    amount,
                    bankCashBefore,
                    bankCashAfter,
                    brokerCashBefore,
                    brokerCashAfter,
                    note: direction === "BANK_TO_BROKER"
                        ? "Bank to broker transfer"
                        : "Broker to bank transfer",
                },
            });
            return {
                bankAccount: updatedBankAccount,
                account: updatedBrokerAccount,
                transaction,
            };
        });
        res.json(result);
    }
    catch (error) {
        if (error instanceof Error && error.message === "INSUFFICIENT_BANK_CASH") {
            return res.status(400).json({
                message: "Insufficient bank cash",
            });
        }
        if (error instanceof Error && error.message === "INSUFFICIENT_BROKER_CASH") {
            return res.status(400).json({
                message: "Insufficient broker cash",
            });
        }
        res.status(500).json({
            message: "Failed to transfer cash",
        });
    }
});
exports.portfolioRouter.get("/cash-transactions", auth_js_1.requireAuth, async (req, res) => {
    try {
        const { userId } = req;
        const requestedLimit = Number(req.query.limit);
        const take = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(Math.floor(requestedLimit), 200)
            : 100;
        const transactions = await prisma_js_1.prisma.cashTransaction.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc",
            },
            take,
        });
        res.json(transactions);
    }
    catch {
        res.status(500).json({
            message: "Failed to load cash transactions",
        });
    }
});
