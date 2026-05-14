"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
const adapter = new adapter_better_sqlite3_1.PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
});
exports.prisma = new client_1.PrismaClient({ adapter });
