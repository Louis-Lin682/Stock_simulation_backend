import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.route.js";
import { stocksRouter } from "./routes/stocks.route.js";
import { portfolioRouter } from "./routes/portfolio.route.js";
import { ordersRouter } from "./routes/orders.route.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Stock simulation backend is running",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/stocks", stocksRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/orders", ordersRouter);

const port = 3001;

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
