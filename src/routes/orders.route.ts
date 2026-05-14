import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/auth.js";
import {
  getMarketConfig,
  getMarketStockBySymbol,
  isSupportedStockSymbol,
  normalizeMarket,
  normalizeSymbol,
} from "../services/market.service.js";
import {
  addFilledBuyHolding,
  calculateTradeCost,
  cancelPendingOrder,
  getOrCreateBrokerAccount,
  reduceFilledSellHolding,
  shouldFillOrder,
  syncPendingOrders,
  type OrderSide,
  type OrderType,
} from "../services/order-sync.service.js";
import {
  isMarketSessionOpen,
  serializeOrderTiming,
} from "../services/trading-calendar.service.js";

export const ordersRouter = Router();

function normalizeOrderType(value?: string): OrderType | null {
  if (!value) return "MARKET";
  const upperValue = value.toUpperCase();

  if (upperValue === "MARKET" || upperValue === "LIMIT") {
    return upperValue;
  }

  return null;
}

function getAvailableQuantity(
  holding: { quantity: number; reservedQuantity: number } | null
) {
  return holding === null ? 0 : holding.quantity - holding.reservedQuantity;
}

ordersRouter.get("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;

    await syncPendingOrders(userId);

    const orders = await prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const decoratedOrders = await Promise.all(
      orders.map(async (order) => ({
        ...order,
        ...(await serializeOrderTiming(order)),
      }))
    );

    res.json(decoratedOrders);
  } catch (error) {
    console.error("Failed to load orders", error);

    res.status(500).json({
      message: "Failed to load orders",
    });
  }
});

ordersRouter.post("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const {
      market: marketValue,
      symbol: rawSymbol,
      side,
      orderType: rawOrderType,
      limitPrice,
      quantity,
    } = req.body as {
      market?: string;
      symbol?: string;
      side?: OrderSide;
      orderType?: string;
      limitPrice?: number;
      quantity?: number;
    };

    if (!rawSymbol || !side || !quantity) {
      return res.status(400).json({
        message: "symbol, side and quantity are required",
      });
    }

    const market = normalizeMarket(marketValue ?? "TW");

    if (!market) {
      return res.status(400).json({
        message: "market must be TW or US",
      });
    }

    const symbol = normalizeSymbol(market, rawSymbol);

    if (!isSupportedStockSymbol(market, symbol)) {
      return res.status(400).json({
        message: "symbol is not supported for this market",
      });
    }

    if (side !== "BUY" && side !== "SELL") {
      return res.status(400).json({
        message: "side must be BUY or SELL",
      });
    }

    const orderType = normalizeOrderType(rawOrderType);

    if (!orderType) {
      return res.status(400).json({
        message: "orderType must be MARKET or LIMIT",
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        message: "quantity must be a positive integer",
      });
    }

    if (orderType === "LIMIT" && (typeof limitPrice !== "number" || limitPrice <= 0)) {
      return res.status(400).json({
        message: "limitPrice must be a positive number for limit orders",
      });
    }

    const stock = await getMarketStockBySymbol(market, symbol);

    if (!stock || stock.close === null) {
      return res.status(404).json({
        message: "Stock price not found",
      });
    }

    const now = new Date();
    const marketConfig = getMarketConfig(market);
    const currentPrice = stock.close;
    const orderPrice = orderType === "LIMIT" ? limitPrice! : currentPrice;
    const canAttemptImmediateFill = await isMarketSessionOpen(market, now);
    const isFilled =
      canAttemptImmediateFill && shouldFillOrder(side, orderType, orderPrice, currentPrice);
    const amount = (isFilled ? currentPrice : orderPrice) * quantity;
    const cost = calculateTradeCost(market, marketConfig.currency, symbol, side, amount);

    const result = await prisma.$transaction(async (tx) => {
      const account = await getOrCreateBrokerAccount(tx, userId, market);
      const existingHoldingBefore = await tx.holding.findUnique({
        where: {
          userId_market_symbol: {
            userId,
            market,
            symbol,
          },
        },
      });
      const availableCashBefore = account.cash;
      const availableQuantityBefore = getAvailableQuantity(existingHoldingBefore);
      const availableCashAfter =
        side === "BUY"
          ? account.cash - cost.netAmount
          : isFilled
            ? account.cash + cost.netAmount
            : account.cash;
      const availableQuantityAfter =
        side === "BUY"
          ? isFilled
            ? availableQuantityBefore + quantity
            : availableQuantityBefore
          : availableQuantityBefore - quantity;
      let realizedPnL = 0;

      if (side === "BUY") {
        if (account.cash < cost.netAmount) {
          throw new Error("INSUFFICIENT_CASH");
        }

        if (isFilled) {
          await addFilledBuyHolding(
            tx,
            userId,
            market,
            marketConfig.currency,
            stock.symbol,
            stock.name,
            quantity,
            cost.netAmount
          );

          await tx.account.update({
            where: {
              id: account.id,
            },
            data: {
              cash: {
                decrement: cost.netAmount,
              },
            },
          });
        } else {
          await tx.account.update({
            where: {
              id: account.id,
            },
            data: {
              cash: {
                decrement: cost.netAmount,
              },
              reservedCash: {
                increment: cost.netAmount,
              },
            },
          });
        }
      }

      if (side === "SELL") {
        const availableQuantity = getAvailableQuantity(existingHoldingBefore);

        if (availableQuantity < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        if (isFilled) {
          const soldCostBasis = await reduceFilledSellHolding(tx, userId, market, symbol, quantity);
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
        } else {
          await tx.holding.update({
            where: {
              userId_market_symbol: {
                userId,
                market,
                symbol,
              },
            },
            data: {
              reservedQuantity: {
                increment: quantity,
              },
            },
          });
        }
      }

      return tx.order.create({
        data: {
          userId,
          market,
          currency: marketConfig.currency,
          symbol: stock.symbol,
          name: stock.name,
          side,
          orderType,
          status: isFilled ? "FILLED" : "PENDING",
          price: orderPrice,
          limitPrice: orderType === "LIMIT" ? orderPrice : null,
          filledPrice: isFilled ? currentPrice : null,
          quantity,
          amount,
          fee: cost.fee,
          tax: cost.tax,
          netAmount: cost.netAmount,
          realizedPnL,
          availableCashBefore,
          availableCashAfter,
          availableQuantityBefore,
          availableQuantityAfter,
          createdAt: now,
          filledAt: isFilled ? now : null,
        },
      });
    });

    const response = {
      ...result,
      ...(await serializeOrderTiming(result)),
    };

    res.status(201).json(response);
  } catch (error) {
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

    if (error instanceof Error && error.message === "INSUFFICIENT_CASH") {
      return res.status(400).json({
        message: "Insufficient cash",
      });
    }

    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return res.status(400).json({
        message: "Insufficient stock quantity",
      });
    }

    console.error("Failed to create order", error);

    res.status(500).json({
      message: "Failed to create order",
    });
  }
});

ordersRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        message: "Invalid order id",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: {
          id: orderId,
        },
      });

      if (!order || order.userId !== userId) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (order.status !== "PENDING") {
        throw new Error("ORDER_NOT_PENDING");
      }

      return cancelPendingOrder(tx, order, new Date());
    });

    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (error instanceof Error && error.message === "ORDER_NOT_PENDING") {
      return res.status(400).json({
        message: "Only pending orders can be cancelled",
      });
    }

    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return res.status(400).json({
        message: "Insufficient stock quantity",
      });
    }

    res.status(500).json({
      message: "Failed to cancel order",
    });
  }
});

