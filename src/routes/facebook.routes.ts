import express from "express";
import passport from "../config/passport.config";
import { FacebookService } from "../services/facebook.service";
import { authenticateToken } from "../middleware/auth.middleware";
import { validateOwnership } from "../middleware/social-account.middleware";
import * as crypto from "crypto";
import redisService from "../services/redis.service";

const router = express.Router();
const facebookService = new FacebookService();

// Direct auth route for Facebook
router.get(
  "/facebook/direct-auth",
  authenticateToken,
  async (req: any, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Generate a unique state ID
      const stateId = crypto.randomBytes(16).toString("hex");

      // Create state data object
      const stateData = {
        uid: req.user.uid,
        email: req.user.email,
        organizationId: req.user.organizationId,
        currentTeamId: req.user.currentTeamId,
        timestamp: Date.now(),
      };

      // Store in Redis with 10 minute expiration
      await redisService.set(`facebook:${stateId}`, stateData, 600);

      // Return the full URL with state parameter
      const baseUrl = process.env.API_URL ?? "http://localhost:3001";
      res.send(`${baseUrl}/api/social-accounts/facebook?state=${stateId}`);
    } catch (error) {
      console.error("Error in Facebook direct-auth:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Initiate Facebook login - simplified version
router.get(
  "/facebook",
  async (req, res, next) => {
    console.log("Session user check:", !!req.session.user);

    // Check for state parameter
    const { state } = req.query;

    if (!state) {
      console.error("No state parameter found in Facebook auth request");
      return res.status(400).json({ error: "Missing state parameter" });
    }

    try {
      // Retrieve state data from Redis
      const stateData = await redisService.get(`facebook:${state as string}`);

      if (!stateData) {
        console.error("No state data found in Redis for Facebook auth");
        return res.status(401).json({ error: "Invalid or expired state" });
      }

      // Check for timestamp expiration (10 minute window)
      if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
        await redisService.delete(`facebook:${state as string}`);
        return res.status(401).json({ error: "Authentication link expired" });
      }

      // Store user data in session for passport to use
      req.session.user = {
        uid: stateData.uid,
        email: stateData.email,
        organizationId: stateData.organizationId,
        currentTeamId: stateData.currentTeamId,
      };

      // Store state ID to retrieve later in callback
      req.session.facebookStateId = state as string;

      // Save session before continuing to passport
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      next();
    } catch (error) {
      console.error("Error retrieving Facebook state data:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
  passport.authenticate("facebook", {
    scope: ["email", "public_profile"],
  })
);

// Facebook callback with proper error handling
router.get("/facebook/callback", (req, res, next) => {
  passport.authenticate(
    "facebook",
    async (err: any, account: any, info: any) => {
      console.log("Facebook callback received:", {
        error: err ? "Error occurred" : null,
        profile: account ? "Profile received" : "No profile",
      });

      if (err) {
        console.error("Facebook OAuth error:", err);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/settings?error=true&message=${encodeURIComponent(
            err.message || "Authentication failed"
          )}`
        );
      }

      if (!account) {
        console.error("No account data received from Facebook authentication");
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=true&message=No account data received`
        );
      }

      try {
        // Success - the account has already been created in the Facebook strategy
        console.log("Facebook account connected successfully:", account.id);

        // Redirect to settings page
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?success=true`
        );
      } catch (error: any) {
        console.error("Error in Facebook callback:", error);

        // Check for duplicate account error
        if (
          error.code === "ACCOUNT_ALREADY_LINKED" ||
          error.code === "account_already_connected"
        ) {
          return res.redirect(
            `${
              process.env.FRONTEND_URL
            }/settings?error=duplicate_account&message=${encodeURIComponent(
              error.message ||
                "This Facebook account is already connected to another user"
            )}`
          );
        }

        // Handle other errors
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/settings?error=true&message=${encodeURIComponent(
            error.message || "Failed to connect Facebook account"
          )}`
        );
      }
    }
  )(req, res, next);
});

// Post to Facebook
router.post(
  "/facebook/post",
  authenticateToken,
  validateOwnership("social_account"),
  async (req, res) => {
    const { accountId, message } = req.body;
    try {
      const result = await facebookService.postToFacebook(accountId, message);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
