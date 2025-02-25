import { Router } from "express";
import { SocialAccountController } from "../controllers/social-account.controller";
import { authenticateToken } from "../middleware/auth.middleware";
import passport from "../config/passport.config";
import { Session } from "express-session";

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
        personalPreferences?: Record<string, any>;
      };
    };
  }
}

const router = Router();
const controller = new SocialAccountController();

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
router.get("/twitter/direct-auth", authenticateToken, (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Store user data in session
    req.session.user = req.user;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session error" });
      }

      // Return the full URL
      const baseUrl = process.env.API_URL || "http://localhost:3001";
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

// router.get(
//   "/twitter/callback",
//   passport.authenticate("oauth2", {
//     failureRedirect: `${process.env.FRONTEND_URL}/settings?error=true`,
//   }),
//   controller.handleTwitterCallback.bind(controller)
// );

router.get(
  "/twitter/callback",
  passport.authenticate("oauth2", {
    failureRedirect: `${process.env.FRONTEND_URL}/settings?error=true`,
    successRedirect: `${process.env.FRONTEND_URL}/settings?success=true`,
  })
);

// Disconnect social account
router.post("/:platform/disconnect", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { platform } = req.params;
    await controller.disconnectAccount(req.user.uid, platform);
    res.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting account:", error);
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

// Tweet management routes
router.post(
  "/twitter/tweet",
  authenticateToken,
  controller.postTweet.bind(controller)
);
router.post(
  "/twitter/schedule",
  authenticateToken,
  controller.scheduleTweet.bind(controller)
);

export default router;
