import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import { validationResult } from "express-validator";
import { config } from "dotenv";
import { authenticateToken } from "./middleware/auth.middleware";

// Import routes
import authRoutes from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import teamsRouter from "./routes/teams.routes";
import invitationsRouter from "./routes/invitations.routes";
import contentRouter from "./routes/content.routes";
import collectionsRouter from "./routes/collections.routes";
import analysisRouter from "./routes/analysis.routes";

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet()); // Security headers
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
); // Enable CORS with specific options
app.use(compression()); // Compress responses
app.use(morgan("dev")); // Request logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Debug middleware to log all requests
// app.use((req, res, next) => {
//   console.log("\n[DEBUG] Request:");
//   console.log("Method:", req.method);
//   console.log("URL:", req.url);
//   console.log("Original URL:", req.originalUrl);
//   console.log("Base URL:", req.baseUrl);
//   console.log("Path:", req.path);
//   console.log("Headers:", req.headers);
//   console.log("Body:", req.body);
//   console.log("Query:", req.query);
//   console.log("Params:", req.params);
//   next();
// });

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
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test endpoint at app level
app.get("/test", (req, res) => {
  console.log("[DEBUG] App-level test endpoint hit");
  res.json({ message: "App is working" });
});

// Routes
// console.log("\n[DEBUG] ====== Mounting routes... ======");

// // Mount invitation routes first (includes test route)
// console.log("[DEBUG] Mounting /api/invitations");
app.use("/api/invitations", invitationsRouter);

// console.log("[DEBUG] Mounting /api/auth");
app.use("/api/auth", authRoutes);

// console.log("[DEBUG] Mounting /api/users");
app.use("/api/users", authenticateToken, usersRouter);

// console.log("[DEBUG] Mounting /api/teams");
app.use("/api/teams", authenticateToken, teamsRouter);

// console.log("[DEBUG] Mounting /api/content");
// console.log("[DEBUG] Content router stack details:");
// contentRouter?.stack?.forEach((layer: any, index: number) => {
//   console.log(`[DEBUG] Layer ${index}:`, {
//     name: layer.name,
//     path: layer.route?.path,
//     methods: layer.route?.methods
//       ? Object.keys(layer.route.methods)
//       : undefined,
//   });
// });

// Mount content router with debug logging
app.use(
  "/api/content",
  (req, res, next) => {
    // console.log("\n[DEBUG] Content router middleware hit");
    // console.log("[DEBUG] Request path:", req.path);
    // console.log("[DEBUG] Request baseUrl:", req.baseUrl);
    // console.log("[DEBUG] Request originalUrl:", req.originalUrl);

    // Skip authentication for generate route in development
    // if (process.env.NODE_ENV === "development" && req.path === "/generate") {
    //   console.log("[DEBUG] Bypassing auth for content generation");
    //   req.user = {
    //     uid: "test-user-id",
    //     email: "test@example.com",
    //     teamIds: ["test-team-id"],
    //     currentTeamId: "test-team-id",
    //     isNewUser: false,
    //   };
    //   return next();
    // }
    return authenticateToken(req, res, next);
  },
  contentRouter
);

// console.log("[DEBUG] Mounting /api/collections");
app.use("/api/collections", authenticateToken, collectionsRouter);

// console.log("[DEBUG] Mounting /api/analysis");
app.use("/api/analysis", authenticateToken, analysisRouter);

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

// try {
//   const allRoutes = listEndpoints("", app._router);
//   console.log("[DEBUG] Total routes registered:", allRoutes.length);
//   console.log("[DEBUG] Routes:", allRoutes);
// } catch (error) {
//   console.error("[ERROR] Failed to list endpoints:", error);
// }

// Log registered route handlers
// console.log("\n[DEBUG] ====== Route Handlers: ======");
// app._router?.stack?.forEach((r: any) => {
//   if (r.route && r.route.path) {
//     console.log(`${Object.keys(r.route.methods).join(",")} ${r.route.path}`);
//   } else if (r.name === "router") {
//     console.log(`Router middleware at: ${r.regexp}`);
//   }
// });

// 404 handler
app.use((req: express.Request, res: express.Response) => {
  // console.log("[DEBUG] 404 Not Found:", req.method, req.url);
  // console.log("Headers:", req.headers);
  // console.log("Body:", req.body);
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

// Start server with error handling
try {
  const server = app.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${port}`);
    console.log("[DEBUG] Environment:", process.env.NODE_ENV);
    // console.log("[DEBUG] Available routes:");
    // app._router.stack.forEach((r: any) => {
    //   if (r.route && r.route.path) {
    //     console.log(
    //       `${Object.keys(r.route.methods).join(",")} ${r.route.path}`
    //     );
    //   } else if (r.name === "router") {
    //     console.log(`Router middleware: ${r.regexp}`);
    //   }
    // });
  });

  server.on("error", (error: any) => {
    console.error("[FATAL] Server failed to start:", error);
    process.exit(1);
  });

  process.on("uncaughtException", (error: Error) => {
    console.error("[FATAL] Uncaught exception:", error);
    server.close(() => {
      process.exit(1);
    });
  });

  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    console.error(
      "[FATAL] Unhandled Rejection at:",
      promise,
      "reason:",
      reason
    );
    server.close(() => {
      process.exit(1);
    });
  });
} catch (error) {
  console.error("[FATAL] Failed to start server:", error);
  process.exit(1);
}

export default app;
