import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import { validationResult } from "express-validator";
import { config } from "dotenv";
import { authenticateToken } from "./middleware/auth.middleware";
import passport from "./config/passport.config";
import https from "https";
import fs from "fs";

// Import routes
import authRoutes from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import teamsRouter from "./routes/teams.routes";
import invitationsRouter from "./routes/invitations.routes";
import contentRouter from "./routes/content.routes";
import collectionsRouter from "./routes/collections.routes";
import analysisRouter from "./routes/analysis.routes";
import socialAccountRouter from "./routes/social-account.routes";
import analyticsRouter from "./routes/analytics.routes";

// Load environment variables
config();

const app = express();
const port = process.env.PORT ?? 3001;

// Middleware
app.use(helmet()); // Security headers
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "https://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
); // Enable CORS with specific options
app.use(compression()); // Compress responses
app.use(morgan("dev")); // Request logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
    name: "mitheai.sid",
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
app.options("/test-cors", cors()); // Enable pre-flight for this specific route
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

// Routes
// console.log("\n[DEBUG] ====== Mounting routes... ======");

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

  if (!router || !router.stack) {
    console.log(`[DEBUG] No routes found for prefix: ${prefix}`);
    return routes;
  }

  router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      const path = prefix + middleware.route.path;
      const methods = Object.keys(middleware.route.methods);
      // console.log(`[DEBUG] Route: ${methods.join(",")} ${path}`);
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
