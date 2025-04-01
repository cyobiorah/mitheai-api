import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import connectMongoDBSession from "connect-mongodb-session";
import { validationResult } from "express-validator";
import { config } from "dotenv";
import { authenticateToken, logRequests } from "./middleware/auth.middleware";
import passport from "./config/passport.config";

import authRoutes from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import teamsRouter from "./routes/teams.routes";
import invitationsRouter from "./routes/invitations.routes";
import contentRouter from "./routes/content.routes";
import collectionsRouter from "./routes/collections.routes";
import analysisRouter from "./routes/analysis.routes";
import socialAccountRouter from "./routes/social-account.routes";
import analyticsRouter from "./routes/analytics.routes";

config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "https://mitheai-app-git-kitchen-cyobiorahs-projects.vercel.app",
  "https://mitheai-api-git-kitchen-cyobiorahs-projects.vercel.app",
  // Add specific Vercel preview domains instead of wildcards
  "https://mitheai-app.vercel.app",
  "https://mitheai-api.vercel.app",
  // Add production domains if different
  "https://app.mitheai.com",
  "https://api.mitheai.com"
];

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: function (origin, callback) {
      // For development/testing - allow requests with no origin (like mobile apps, curl, etc)
      if (!origin) {
        return callback(null, true);
      }

      // Check if the origin is in our allowedOrigins list
      if (allowedOrigins.includes(origin)) {
        return callback(null, origin); // Return the actual origin instead of true
      }

      // For Vercel preview deployments which have dynamic URLs
      if (origin.includes('vercel.app')) {
        return callback(null, origin); // Allow all vercel.app domains and return the specific origin
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Time"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(logRequests);

app.use(compression());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create MongoDB session store
const MongoDBStore = connectMongoDBSession(session);
const store = new MongoDBStore({
  uri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/mitheai",
  collection: "sessions",
  expires: 1000 * 60 * 60 * 24 * 7, // 1 week in milliseconds
  connectionOptions: {
    serverSelectionTimeoutMS: 10000,
  },
});

// Handle store errors
store.on("error", function (error) {
  console.error("Session store error:", error);
});

// Configure session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "your-secret-key-change-this",
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week in milliseconds
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Only use secure in production
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // For cross-site requests in production
    },
    store: store,
    resave: false,
    saveUninitialized: false,
    name: "mitheai.sid", // Custom name for the session cookie
  })
);

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Validation error handler
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
);

// Health check endpoint
app.get("/health", (req, res) => {
  console.log("[DEBUG] Health check endpoint hit");
  console.log("[DEBUG] Request headers:", req.headers);
  console.log("[DEBUG] Request method:", req.method);
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    headers: req.headers,
    method: req.method,
  });
});

// Test endpoint at app level
app.get("/test", (req, res) => {
  console.log("[DEBUG] App-level test endpoint hit");
  res.json({ message: "App is working" });
});

// Test endpoint with explicit CORS
app.options("/test-cors", cors());
app.get("/test-cors", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.json({
    message: "CORS test successful",
    timestamp: new Date().toISOString(),
    headers: req.headers,
  });
});

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/users", authenticateToken, usersRouter);
app.use("/api/teams", authenticateToken, teamsRouter);
app.use("/api/invitations", authenticateToken, invitationsRouter);
app.use("/api/content", authenticateToken, contentRouter);
app.use("/api/collections", authenticateToken, collectionsRouter);
app.use("/api/analysis", authenticateToken, analysisRouter);
app.use("/api/social-accounts", socialAccountRouter);
app.use("/api/analytics", authenticateToken, analyticsRouter);

// Log all registered routes
// console.log("\n[DEBUG] ====== All registered routes: ======");
function listEndpoints(prefix: string, router: any) {
  const routes: any[] = [];

  if (!router?.stack) {
    console.log(`[DEBUG] No routes found for prefix: ${prefix}`);
    return routes;
  }

  router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      const path = prefix + middleware.route.path;
      const methods = Object.keys(middleware.route.methods);
      routes.push({
        path,
        methods: methods.join(","),
      });
    } else if (middleware.name === "router" && middleware.handle?.stack) {
      try {
        const childPrefix =
          prefix +
          (middleware.regexp.source === "^\\/?(?=\\/|$)"
            ? ""
            : middleware.regexp.source
                .replace(/\\\//g, "/")
                .replace(/\(\?:\\\/\)\?/g, "")
                .replace(/\(\?=\\\/\|\$\)/g, ""));
        routes.push(...listEndpoints(childPrefix, middleware.handle));
      } catch (error) {
        console.log(`[DEBUG] Error processing router middleware:`, error);
      }
    }
  });

  return routes;
}

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("[ERROR]", err.stack);
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
);

// Export the app for use in server.ts
export default app;
