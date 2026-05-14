import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  type AuthenticatedRequest,
  requireAuth,
  signAuthToken,
} from "../middleware/auth.js";

export const authRouter = Router();

const INITIAL_CASH = 1_000_000;
const INITIAL_US_CASH = 100_000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user: {
  id: number;
  email: string | null;
  phone: string | null;
  appleId: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    appleId: user.appleId,
    createdAt: user.createdAt,
  };
}

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        message: "email format is invalid",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "password must be at least 8 characters",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "email is already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        // Each new user starts with simulation cash in the bank account, then
        // can transfer it into the securities account like a real broker flow.
        accounts: {
          create: [
            {
              currency: "TWD",
              cash: 0,
            },
            {
              currency: "USD",
              cash: 0,
            },
          ],
        },
        bankAccounts: {
          create: [
            {
              currency: "TWD",
              cash: INITIAL_CASH,
            },
            {
              currency: "USD",
              cash: INITIAL_US_CASH,
            },
          ],
        },
      },
    });

    const token = signAuthToken(user.id);

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to register",
    });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email: normalizeEmail(email),
      },
    });

    if (!user?.passwordHash) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = signAuthToken(user.id);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to login",
    });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthenticatedRequest;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to load current user",
    });
  }
});
