import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type JwtPayload = {
  userId: number;
};

export type AuthenticatedRequest = Request & {
  userId: number;
};

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? "dev-secret-change-me";
}

export function signAuthToken(userId: number): string {
  return jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: "7d",
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
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
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;

    // userId is derived from the signed token, not from client input.
    // This keeps users from reading or trading against another account.
    (req as AuthenticatedRequest).userId = payload.userId;

    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired authorization token",
    });
  }
}
