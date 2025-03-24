import { Router } from "express";
import { SocialAccountController } from "../controllers/social-account.controller";
import {
  authenticateToken,
  requireOrgAccess,
} from "../middleware/auth.middleware";
import passport from "../config/passport.config";
import { validateSocialAccountOperation } from "../middleware/social-account.middleware";
import facebookRoutes from "./facebook.routes";
import threadsRoutes from "./threads.routes";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    user: {
      uid: string;
      email?: string;
      userType?: "individual" | "organization";
      organizationId?: string;
      teamIds?: string[];
      currentTeamId?: string;
      role?: "super_admin" | "org_owner" | "team_manager" | "user";
      isNewUser?: boolean;
      settings?: {
        permissions: string[];
        theme: "light" | "dark";
        notifications: any[];
      };
    };
    skipWelcome?: boolean;
  }
}

const router = Router();
const controller = new SocialAccountController();

// Mount Facebook routes
router.use("/", facebookRoutes);

// Mount Threads routes
router.use("/", threadsRoutes);

// Get all social accounts for the authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const accounts = await controller.getSocialAccounts(req.user.uid);
    res.json(accounts || []); // Ensure we always return an array
  } catch (error) {
    console.error("Error fetching social accounts:", error);
    res.status(500).json({ error: "Failed to fetch social accounts" });
  }
});

// Twitter OAuth routes
router.get("/twitter/direct-auth", authenticateToken, (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const skipWelcome = req.query.skipWelcome === "true";
    req.session.skipWelcome = skipWelcome;

    // Store user data in session
    req.session.user = req.user;
    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session error" });
      }

      // Return the full URL
      const baseUrl = process.env.API_URL ?? "http://localhost:3001";
      res.send(`${baseUrl}/api/social-accounts/twitter/auth`);
    });
  } catch (error) {
    console.error("Error in direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update the auth route to use session data
router.get(
  "/twitter/auth",
  (req, res, next) => {
    // Check if we have user data in session
    if (!req.session.user) {
      return res.status(401).json({ error: "No session found" });
    }
    next();
  },
  passport.authenticate("oauth2", {
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
  })
);

// Twitter callback route with duplicate account checking
router.get(
  "/twitter/callback",
  (req, res, next) => {
    // Add error handling for the OAuth callback
    passport.authenticate("oauth2", (err: any, user: any, info: any) => {
      if (err) {
        console.error("OAuth authentication error:", err);

        // Check for specific error types
        if (err.code === "account_already_connected") {
          // Redirect with specific error for duplicate accounts
          return res.redirect(
            `${
              process.env.FRONTEND_URL
            }/settings?error=duplicate_account&message=${encodeURIComponent(
              err.message
            )}`
          );
        }

        // Handle other errors
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/settings?error=true&message=${encodeURIComponent(
            err.message || "Authentication failed"
          )}`
        );
      }

      if (!user) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=true&message=No user data received`
        );
      }

      // Authentication successful, continue
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return res.redirect(
            `${process.env.FRONTEND_URL}/settings?error=true&message=Login failed`
          );
        }

        // Success - redirect to settings page
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?success=true`
        );
      });
    })(req, res, next);
  },
  controller.handleTwitterCallback.bind(controller)
);

// Facebook direct auth route similar to Twitter
router.get("/facebook/direct-auth", authenticateToken, (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Store user data in session
    req.session.user = req.user;
    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session error" });
      }

      // Return the full URL
      const baseUrl = process.env.API_URL ?? "http://localhost:3001";
      res.send(`${baseUrl}/api/social-accounts/facebook`);
    });
  } catch (error) {
    console.error("Error in Facebook direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Disconnect social account by ID (not platform)
router.post("/disconnect/:accountId", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { accountId } = req.params;
    if (!accountId) {
      return res.status(400).json({ error: "Account ID is required" });
    }

    // Call the updated disconnectAccount method with account ID
    const result = await controller.disconnectAccount(req.user.uid, accountId);
    res.json(result);
  } catch (error: any) {
    console.error("Error disconnecting account:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message || "Unknown error occurred",
    });
  }
});

// Legacy endpoint - maintain for backward compatibility but updated to use account ID
router.post("/:platform/disconnect", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // For backward compatibility - get the account ID from the request body
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({
        error: "Account ID is required",
        message: "Please provide an account ID to disconnect",
      });
    }

    // Call the updated disconnectAccount method with account ID
    const result = await controller.disconnectAccount(req.user.uid, accountId);
    res.json(result);
  } catch (error: any) {
    console.error("Error disconnecting account:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message || "Unknown error occurred",
    });
  }
});

// Tweet management routes - add validateSocialAccountOperation middleware once created
router.post(
  "/twitter/tweet",
  authenticateToken,
  validateSocialAccountOperation,
  controller.postTweet.bind(controller)
);
router.post(
  "/twitter/schedule",
  authenticateToken,
  validateSocialAccountOperation,
  controller.scheduleTweet.bind(controller)
);

// Debug endpoint for testing Twitter API connectivity
router.post(
  "/twitter/debug-connection",
  authenticateToken,
  validateSocialAccountOperation,
  controller.debugTwitterConnection.bind(controller)
);

router.get(
  "/twitter/debug/:accountId",
  authenticateToken,
  validateSocialAccountOperation,
  controller.debugTwitterAccount.bind(controller)
);

router.post(
  "/:accountId/team",
  authenticateToken,
  // validateSocialAccountOperation,
  requireOrgAccess,
  controller.assignTeam.bind(controller)
);

export default router;
