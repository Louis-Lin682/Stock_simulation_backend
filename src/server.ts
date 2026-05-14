import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.route.js";
import { stocksRouter } from "./routes/stocks.route.js";
import { portfolioRouter } from "./routes/portfolio.route.js";
import { ordersRouter } from "./routes/orders.route.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const corsOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  })
);
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

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});