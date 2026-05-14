"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toNumber = toNumber;
function toNumber(value) {
    const cleaned = value
        .replaceAll(",", "")
        .replaceAll("+", "")
        .replaceAll("X", "")
        .trim();
    if (cleaned === "" || cleaned === "--") {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
}
