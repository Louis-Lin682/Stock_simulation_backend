"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAuthToken = signAuthToken;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function getJwtSecret() {
    return process.env.JWT_SECRET ?? "dev-secret-change-me";
}
function signAuthToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, getJwtSecret(), {
        expiresIn: "7d",
    });
}
function requireAuth(req, res, next) {
    const authorization = req.header("Authorization");
    const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
    if (!token) {
        return res.status(401).json({
            message: "Missing authorization token",
        });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, getJwtSecret());
        // userId is derived from the signed token, not from client input.
        // This keeps users from reading or trading against another account.
        req.userId = payload.userId;
        next();
    }
    catch {
        res.status(401).json({
            message: "Invalid or expired authorization token",
        });
    }
}
