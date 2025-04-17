import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes";
import { allowedOrigins } from "./utils";
import { RedisStore } from "connect-redis";
import session from "express-session";
import redisService from "./utils/redisClient";

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
  session({
    store: new RedisStore({ client: redisService.client }),
    secret: process.env.SESSION_SECRET ?? "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    name: "mitheai.sid",
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

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

// API routes
app.use("/api", routes);

// Health check endpoint
app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
