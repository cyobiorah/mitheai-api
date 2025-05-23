import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import routes from "./routes";
import { allowedOrigins } from "./utils";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "./utils/redisClient";
import { validationResult } from "express-validator";
import { handleWebhook } from "./controllers/webhook.controller";
import bodyParser from "body-parser";
import pkg from "../package.json";

dotenv.config();

// -----------------------------------------
// Express App
// -----------------------------------------
const app = express();
app.set("trust proxy", 1); // Trust first proxy (Vercel)

// -----------------------------------------
// Stripe Webhook (must be before express.json())
// -----------------------------------------
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  handleWebhook
);

// -----------------------------------------
// Middleware Setup
// -----------------------------------------
app.use(helmet());
app.use(compression());
app.use(morgan("dev"));

// -----------------------------------------
// CORS
// -----------------------------------------
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, origin);
      if (/^https:\/\/mitheai(-\w+)?\.vercel\.app$/.test(origin))
        return callback(null, origin);
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

// -----------------------------------------
// Rate Limiting
// -----------------------------------------
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
  skip: () => process.env.NODE_ENV !== "production",
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args: string[]) => redisClient.call(...args),
    prefix: "auth-limit:",
  }),
  skip: () => process.env.NODE_ENV !== "production",
});

// API routes
// app.use("/api", apiLimiter, routes);
app.use("/api", apiLimiter);
app.use("/api/auth/", authLimiter);

// -----------------------------------------
// Validation Error Handler
// -----------------------------------------
// app.use((req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }
//   next();
// });

// -----------------------------------------
// Routes
// -----------------------------------------
app.use("/api", routes);

// -----------------------------------------
// Health Check
// -----------------------------------------
app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    version: pkg.version,
    timestamp: new Date().toISOString(),
    headers: _req.headers,
    method: _req.method,
  })
);

// -----------------------------------------
// 404 Handler
// -----------------------------------------
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// -----------------------------------------
// Error Handler
// -----------------------------------------
// app.use((err: any, req: express.Request, res: express.Response) => {
//   console.error("[ERROR]", {
//     message: err.message,
//     stack: err.stack,
//     code: err.code,
//   });
//   res.status(err.status ?? 500).json({
//     error: "Internal Server Error",
//     message: process.env.NODE_ENV === "development" ? err.message : undefined,
//     ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
//   });
// });
app.use((err: any, req: express.Request, res: express.Response) => {
  console.error("[ERROR]", {
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode, // add for visibility
  });

  const status = err.statusCode ?? err.status ?? 500;

  res.status(status).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
