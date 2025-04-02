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
      // const callbackUrl = `${baseUrl}/api/social-accounts/facebook/callback`;

      // Construct the Facebook auth URL with state parameter
      const authUrl = `${baseUrl}/api/social-accounts/facebook?state=${stateId}`;

      console.log(
        `Facebook direct-auth: Generated state ID ${stateId} for user ${req.user.uid}`
      );
      console.log(`Facebook direct-auth: Redirecting to ${authUrl}`);

      res.send(authUrl);
    } catch (error) {
      console.error("Error in Facebook direct-auth:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Initiate Facebook login - simplified version
router.get("/facebook", async (req, res, next) => {
  console.log("Session user check:", !!req.session.user);
  console.log("Request query:", req.query);

  // Check for state parameter
  const { state } = req.query;

  if (!state) {
    console.error("No state parameter found in Facebook auth request");
    return res.status(400).json({ error: "Missing state parameter" });
  }

  try {
    // Retrieve state data from Redis
    const stateData = await redisService.get(`facebook:${state as string}`);

    console.log(
      `Facebook auth: Retrieved state data for state ${state}:`,
      stateData
    );

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
          console.log("Session saved successfully with user data and state ID");
          resolve();
        }
      });
    });

    // Add state to passport authenticate options
    const authOptions = {
      scope: ["email", "public_profile"],
      state: state as string,
    };

    console.log(
      "Proceeding to Facebook authentication with options:",
      authOptions
    );

    // Use custom passport authenticate to pass state
    passport.authenticate("facebook", authOptions)(req, res, next);
  } catch (error) {
    console.error("Error retrieving Facebook state data:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Facebook callback with proper error handling
router.get(
  "/facebook/callback",
  async (req, res, next) => {
    // console.log("Facebook callback received:", {
    //   query: req.query,
    //   headers: {
    //     authorization: req.headers.authorization ? "Present" : "Missing",
    //     cookie: req.headers.cookie ? "Present" : "Missing",
    //   },
    //   sessionID: req.sessionID,
    //   hasSession: !!req.session,
    //   stateParam: req.query.state || "Missing",
    // });

    // Check for error in the callback
    if (req.query.error) {
      console.error("Facebook OAuth error:", req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          req.query.error as string
        )}`
      );
    }

    // Check for state parameter
    const { state, code } = req.query;

    if (!state) {
      console.error("No state parameter in Facebook callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          "Missing state parameter"
        )}`
      );
    }

    // Try to retrieve state data from Redis
    try {
      const stateData = await redisService.get(`facebook:${state as string}`);

      if (!stateData) {
        console.error(`No state data found in Redis for state: ${state}`);
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
            "Invalid or expired authentication link"
          )}`
        );
      }

      console.log(
        `Facebook callback: Found state data for state ${state}:`,
        stateData
      );

      // Store user data in session for passport to use
      req.session.user = {
        uid: stateData.uid,
        email: stateData.email,
        organizationId: stateData.organizationId,
        currentTeamId: stateData.currentTeamId,
      };

      // Store state ID for the Facebook strategy to use
      req.session.facebookStateId = state as string;

      // Save session before continuing to passport
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) {
            console.error("Session save error in callback:", err);
            reject(err);
          } else {
            console.log("Session saved successfully in callback");
            resolve();
          }
        });
      });

      // Continue to passport authentication
      next();
    } catch (error) {
      console.error("Error processing Facebook callback:", error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          "Error processing authentication"
        )}`
      );
    }
  },
  passport.authenticate("facebook", {
    failureRedirect: `${process.env.FRONTEND_URL}/settings?error=Authentication%20failed`,
    session: false,
  }),
  (req: any, res) => {
    // Successful authentication
    try {
      if (!req.user) {
        console.error("No user data in Facebook callback response");
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=No%20user%20data`
        );
      }

      console.log(
        "Facebook authentication successful, redirecting to frontend"
      );

      // Redirect to the frontend with success
      return res.redirect(`${process.env.FRONTEND_URL}/settings?success=true`);
    } catch (error) {
      console.error("Error in Facebook callback redirect:", error);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=Callback%20error`
      );
    }
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
