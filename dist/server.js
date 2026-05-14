"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_route_js_1 = require("./routes/auth.route.js");
const stocks_route_js_1 = require("./routes/stocks.route.js");
const portfolio_route_js_1 = require("./routes/portfolio.route.js");
const orders_route_js_1 = require("./routes/orders.route.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (_req, res) => {
    res.json({
        message: "Stock simulation backend is running",
    });
});
app.use("/api/auth", auth_route_js_1.authRouter);
app.use("/api/stocks", stocks_route_js_1.stocksRouter);
app.use("/api/portfolio", portfolio_route_js_1.portfolioRouter);
app.use("/api/orders", orders_route_js_1.ordersRouter);
const port = 3001;
app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
});
