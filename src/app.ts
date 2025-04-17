import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes";
import { allowedOrigins } from "./utils";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import redisService, { redisClient } from "./utils/redisClient";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    twitterOAuthState?: string;
    user?: {
      _id: string;
      email: string;
      organizationId: string;
      currentTeamId: string;
    };
  }
}

dotenv.config();

const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, origin);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Time"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => redisClient.call(...args),
    prefix: "rate-limit:",
  }),
  skip: (req: express.Request) => process.env.NODE_ENV !== "production",
});

// API routes
app.use("/api", apiLimiter, routes);

// Health check endpoint
app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
