"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMarketSessionOpen = isMarketSessionOpen;
exports.shouldFillOrder = shouldFillOrder;
exports.calculateTradeCost = calculateTradeCost;
exports.getOrCreateBrokerAccount = getOrCreateBrokerAccount;
exports.addFilledBuyHolding = addFilledBuyHolding;
exports.reduceFilledSellHolding = reduceFilledSellHolding;
exports.fillPendingOrder = fillPendingOrder;
exports.cancelPendingOrder = cancelPendingOrder;
exports.syncPendingOrders = syncPendingOrders;
const prisma_js_1 = require("../lib/prisma.js");
const market_service_js_1 = require("./market.service.js");
const trading_calendar_service_js_1 = require("./trading-calendar.service.js");
function getMarketTimeZone(market) {
    return market === "US" ? "America/New_York" : "Asia/Taipei";
}
function getMarketOpenMinutes(market) {
    return market === "US" ? 9 * 60 + 30 : 9 * 60;
}
function getMarketCloseMinutes(market) {
    return market === "US" ? 16 * 60 : 13 * 60 + 30;
}
function getMarketDateInfo(date, market) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: getMarketTimeZone(market),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return {
        dateKey: `${year}-${month}-${day}`,
        minutes: hour * 60 + minute,
    };
}
function isMarketBusinessDay(date, market) {
    const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: getMarketTimeZone(market),
        weekday: "short",
    }).format(date);
    return weekday !== "Sat" && weekday !== "Sun";
}
function getNextBusinessDayDateKey(date, market) {
    const cursor = new Date(date);
    for (let index = 0; index < 10; index += 1) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        if (isMarketBusinessDay(cursor, market)) {
            return getMarketDateInfo(cursor, market).dateKey;
        }
    }
    return getMarketDateInfo(cursor, market).dateKey;
}
function getOrderEffectiveDateKey(order) {
    const market = order.market === "US" ? "US" : "TW";
    const createdInfo = getMarketDateInfo(order.createdAt, market);
    if (isMarketBusinessDay(order.createdAt, market) &&
        createdInfo.minutes < getMarketCloseMinutes(market)) {
        return createdInfo.dateKey;
    }
    return getNextBusinessDayDateKey(order.createdAt, market);
}
function isMarketSessionOpen(market, now = new Date()) {
    if (!isMarketBusinessDay(now, market)) {
        return false;
    }
    const nowInfo = getMarketDateInfo(now, market);
    return (nowInfo.minutes >= getMarketOpenMinutes(market) &&
        nowInfo.minutes < getMarketCloseMinutes(market));
}
function shouldAttemptPendingOrderFill(order, now = new Date()) {
    const market = order.market === "US" ? "US" : "TW";
    if (!isMarketSessionOpen(market, now)) {
        return false;
    }
    const nowInfo = getMarketDateInfo(now, market);
    const effectiveDateKey = getOrderEffectiveDateKey(order);
    return nowInfo.dateKey >= effectiveDateKey;
}
function isDayOrderExpired(order, now = new Date()) {
    const market = order.market === "US" ? "US" : "TW";
    const createdInfo = getMarketDateInfo(order.createdAt, market);
    const nowInfo = getMarketDateInfo(now, market);
    if (nowInfo.dateKey > createdInfo.dateKey) {
        return true;
    }
    if (nowInfo.dateKey < createdInfo.dateKey) {
        return false;
    }
    return nowInfo.minutes >= getMarketCloseMinutes(market);
}
function shouldFillOrder(side, orderType, orderPrice, currentPrice) {
    if (orderType === "MARKET")
        return true;
    return side === "BUY"
        ? orderPrice >= currentPrice
        : orderPrice <= currentPrice;
}
function roundCurrency(currency, value) {
    if (currency === "TWD") {
        return Math.round(value);
    }
    return Math.round(value * 100) / 100;
}
function isTaiwanEtf(symbol) {
    return symbol.startsWith("00");
}
function calculateTradeCost(market, currency, symbol, side, amount) {
    const fee = market === "TW"
        ? roundCurrency(currency, Math.max(20, amount * 0.001425))
        : roundCurrency(currency, Math.max(1, amount * 0.001));
    const tax = market === "TW" && side === "SELL"
        ? roundCurrency(currency, amount * (isTaiwanEtf(symbol) ? 0.001 : 0.003))
        : 0;
    const netAmount = side === "BUY" ? amount + fee + tax : amount - fee - tax;
    return {
        fee,
        tax,
        netAmount: roundCurrency(currency, netAmount),
    };
}
function getAvailableQuantity(holding) {
    return holding === null ? 0 : holding.quantity - holding.reservedQuantity;
}
async function getOrCreateBrokerAccount(tx, userId, market) {
    const marketConfig = (0, market_service_js_1.getMarketConfig)(market);
    return ((await tx.account.findUnique({
        where: {
            userId_currency: {
                userId,
                currency: marketConfig.currency,
            },
        },
    })) ??
        (await tx.account.create({
            data: {
                userId,
                currency: marketConfig.currency,
                cash: 0,
            },
        })));
}
async function addFilledBuyHolding(tx, userId, market, currency, symbol, name, quantity, amount) {
    const existingHolding = await tx.holding.findUnique({
        where: {
            userId_market_symbol: {
                userId,
                market,
                symbol,
            },
        },
    });
    if (!existingHolding) {
        await tx.holding.create({
            data: {
                userId,
                market,
                currency,
                symbol,
                name,
                quantity,
                averageCost: amount / quantity,
            },
        });
        return;
    }
    const totalCost = existingHolding.averageCost * existingHolding.quantity + amount;
    const newQuantity = existingHolding.quantity + quantity;
    await tx.holding.update({
        where: {
            userId_market_symbol: {
                userId,
                market,
                symbol,
            },
        },
        data: {
            quantity: newQuantity,
            averageCost: totalCost / newQuantity,
        },
    });
}
async function reduceFilledSellHolding(tx, userId, market, symbol, quantity, reservedQuantityToRelease = 0) {
    const existingHolding = await tx.holding.findUnique({
        where: {
            userId_market_symbol: {
                userId,
                market,
                symbol,
            },
        },
    });
    if (!existingHolding) {
        throw new Error("INSUFFICIENT_STOCK");
    }
    const availableQuantity = existingHolding.quantity - existingHolding.reservedQuantity;
    if (reservedQuantityToRelease === 0 && availableQuantity < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
    }
    const newQuantity = existingHolding.quantity - quantity;
    const newReservedQuantity = existingHolding.reservedQuantity - reservedQuantityToRelease;
    const soldCostBasis = existingHolding.averageCost * quantity;
    if (newQuantity === 0) {
        await tx.holding.delete({
            where: {
                userId_market_symbol: {
                    userId,
                    market,
                    symbol,
                },
            },
        });
        return soldCostBasis;
    }
    await tx.holding.update({
        where: {
            userId_market_symbol: {
                userId,
                market,
                symbol,
            },
        },
        data: {
            quantity: newQuantity,
            reservedQuantity: Math.max(newReservedQuantity, 0),
        },
    });
    return soldCostBasis;
}
async function fillPendingOrder(tx, order, currentPrice) {
    const market = order.market === "US" ? "US" : "TW";
    const fillAmount = currentPrice * order.quantity;
    const cost = calculateTradeCost(market, order.currency, order.symbol, order.side, fillAmount);
    const filledAt = new Date();
    const account = await getOrCreateBrokerAccount(tx, order.userId, market);
    const existingHolding = await tx.holding.findUnique({
        where: {
            userId_market_symbol: {
                userId: order.userId,
                market,
                symbol: order.symbol,
            },
        },
    });
    const availableCashBefore = account.cash;
    const availableQuantityBefore = getAvailableQuantity(existingHolding);
    const availableCashAfter = order.side === "BUY"
        ? account.cash + Math.max(order.netAmount - cost.netAmount, 0)
        : account.cash + cost.netAmount;
    const availableQuantityAfter = order.side === "BUY"
        ? availableQuantityBefore + order.quantity
        : Math.max(availableQuantityBefore, 0);
    let realizedPnL = 0;
    if (order.side === "BUY") {
        await addFilledBuyHolding(tx, order.userId, market, order.currency, order.symbol, order.name, order.quantity, cost.netAmount);
        await tx.account.update({
            where: {
                id: account.id,
            },
            data: {
                cash: {
                    increment: Math.max(order.netAmount - cost.netAmount, 0),
                },
                reservedCash: {
                    decrement: order.netAmount,
                },
            },
        });
    }
    else {
        const soldCostBasis = await reduceFilledSellHolding(tx, order.userId, market, order.symbol, order.quantity, order.quantity);
        realizedPnL = cost.netAmount - soldCostBasis;
        await tx.account.update({
            where: {
                id: account.id,
            },
            data: {
                cash: {
                    increment: cost.netAmount,
                },
            },
        });
    }
    await tx.order.update({
        where: {
            id: order.id,
        },
        data: {
            status: "FILLED",
            filledPrice: currentPrice,
            amount: fillAmount,
            fee: cost.fee,
            tax: cost.tax,
            netAmount: cost.netAmount,
            realizedPnL,
            availableCashBefore: order.availableCashBefore ?? availableCashBefore,
            availableCashAfter: order.availableCashAfter ?? availableCashAfter,
            availableQuantityBefore: order.availableQuantityBefore ?? availableQuantityBefore,
            availableQuantityAfter: order.availableQuantityAfter ?? availableQuantityAfter,
            filledAt,
        },
    });
}
async function cancelPendingOrder(tx, order, reasonTimestamp = new Date()) {
    const userId = order.userId;
    const market = order.market === "US" ? "US" : "TW";
    let availableCashBefore = order.availableCashBefore;
    let availableCashAfter = order.availableCashAfter;
    let availableQuantityBefore = order.availableQuantityBefore;
    let availableQuantityAfter = order.availableQuantityAfter;
    if (order.side === "BUY") {
        const account = await getOrCreateBrokerAccount(tx, userId, market);
        const reservedAmount = order.netAmount > 0 ? order.netAmount : order.amount;
        availableCashBefore ??= account.cash;
        availableCashAfter ??= account.cash + reservedAmount;
        await tx.account.update({
            where: {
                id: account.id,
            },
            data: {
                cash: {
                    increment: reservedAmount,
                },
                reservedCash: {
                    decrement: reservedAmount,
                },
            },
        });
    }
    else {
        const holding = await tx.holding.findUnique({
            where: {
                userId_market_symbol: {
                    userId,
                    market,
                    symbol: order.symbol,
                },
            },
        });
        if (!holding) {
            throw new Error("INSUFFICIENT_STOCK");
        }
        const availableQuantity = getAvailableQuantity(holding);
        availableQuantityBefore ??= availableQuantity;
        availableQuantityAfter ??= availableQuantity + order.quantity;
        await tx.holding.update({
            where: {
                userId_market_symbol: {
                    userId,
                    market,
                    symbol: order.symbol,
                },
            },
            data: {
                reservedQuantity: Math.max(holding.reservedQuantity - order.quantity, 0),
            },
        });
    }
    return tx.order.update({
        where: {
            id: order.id,
        },
        data: {
            status: "CANCELLED",
            availableCashBefore,
            availableCashAfter,
            availableQuantityBefore,
            availableQuantityAfter,
            cancelledAt: reasonTimestamp,
        },
    });
}
async function syncPendingOrders(userId) {
    const now = new Date();
    const pendingOrders = await prisma_js_1.prisma.order.findMany({
        where: {
            userId,
            status: "PENDING",
        },
        orderBy: {
            createdAt: "asc",
        },
    });
    for (const order of pendingOrders) {
        const market = order.market === "US" ? "US" : "TW";
        const orderType = order.orderType === "LIMIT" ? "LIMIT" : "MARKET";
        if (await (0, trading_calendar_service_js_1.shouldAttemptPendingOrderFill)(order, now)) {
            const stock = await (0, market_service_js_1.getMarketStockBySymbol)(market, order.symbol).catch(() => null);
            const currentPrice = stock?.close;
            if (currentPrice !== null && currentPrice !== undefined) {
                const shouldFill = shouldFillOrder(order.side, orderType, order.price, currentPrice);
                if (shouldFill) {
                    await prisma_js_1.prisma.$transaction(async (tx) => {
                        const latestOrder = await tx.order.findUnique({
                            where: {
                                id: order.id,
                            },
                        });
                        if (!latestOrder ||
                            latestOrder.userId !== userId ||
                            latestOrder.status !== "PENDING") {
                            return;
                        }
                        await fillPendingOrder(tx, latestOrder, currentPrice);
                    });
                    continue;
                }
            }
        }
        if (!(await (0, trading_calendar_service_js_1.isDayOrderExpired)(order, now))) {
            continue;
        }
        await prisma_js_1.prisma.$transaction(async (tx) => {
            const latestOrder = await tx.order.findUnique({
                where: {
                    id: order.id,
                },
            });
            if (!latestOrder ||
                latestOrder.userId !== userId ||
                latestOrder.status !== "PENDING") {
                return;
            }
            await cancelPendingOrder(tx, latestOrder);
        });
    }
}
