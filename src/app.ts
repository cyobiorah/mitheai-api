import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes";
import { allowedOrigins } from "./utils";

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

// API routes
app.use("/api", routes);

// Health check endpoint
app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
