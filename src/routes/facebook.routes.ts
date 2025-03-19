import express from "express";
import passport from "../config/passport.config";
import { FacebookService } from "../services/facebook.service";
import { authenticateToken } from "../middleware/auth.middleware";
import { validateOwnership } from "../middleware/social-account.middleware";

const router = express.Router();
const facebookService = new FacebookService();

// Direct auth route for Facebook
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
      const baseUrl = process.env.API_URL || "http://localhost:3001";
      res.send(`${baseUrl}/api/social-accounts/facebook`);
    });
  } catch (error) {
    console.error("Error in Facebook direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Initiate Facebook login - simplified version
router.get(
  "/facebook",
  (req, res, next) => {
    console.log("Session user check:", !!req.session.user);
    if (!req.session.user) {
      return res.status(401).json({ error: "No user session found" });
    }
    next();
  },
  passport.authenticate("facebook", { 
    scope: ["email", "public_profile"],
  })
);

// Facebook callback with proper error handling
router.get(
  "/facebook/callback",
  (req, res, next) => {
    passport.authenticate("facebook", async (err: any, account: any, info: any) => {
      console.log("Facebook callback received:", { 
        error: err ? "Error occurred" : null,
        profile: account ? "Profile received" : "No profile", 
      });
      
      if (err) {
        console.error("Facebook OAuth error:", err);
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=true&message=${encodeURIComponent(
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
        if (error.code === "ACCOUNT_ALREADY_LINKED" || error.code === "account_already_connected") {
          return res.redirect(
            `${process.env.FRONTEND_URL}/settings?error=duplicate_account&message=${encodeURIComponent(
              error.message || "This Facebook account is already connected to another user"
            )}`
          );
        }
        
        // Handle other errors
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=true&message=${encodeURIComponent(
            error.message || "Failed to connect Facebook account"
          )}`
        );
      }
    })(req, res, next);
  }
);

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
