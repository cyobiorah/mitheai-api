import { Request, Response } from "express";
import * as linkedinService from "../../services/platforms/linkedin.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL!;
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI!;

// 1. Start LinkedIn OAuth
export const startDirectLinkedinAuth = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Generate a unique state ID for CSRF protection
    const stateId = crypto.randomBytes(16).toString("hex");

    // Store user data in Redis with the state ID as key
    const stateData = {
      userId: req.user.id,
      email: req.user.email,
      organizationId: req.user.organizationId,
      teamIds: req.user.teamIds,
      currentTeamId: req.user.currentTeamId,
      role: req.user.role,
      timestamp: Date.now(),
    };

    // Save to Redis with 10-minute expiration (600 seconds)
    await redisService.set(`linkedin:${stateId}`, stateData, 600);

    const authUrl = await linkedinService.getAuthorizationUrl(stateId);

    // Return the LinkedIn authorization URL instead of redirecting
    res.send(authUrl);
  } catch (error: any) {
    console.error("LinkedIn direct auth error:", error);
    res.status(500).json({
      error: "Failed to initiate LinkedIn authentication",
      message: error.message ?? "Unknown error",
    });
  }
};

// 2. LinkedIn OAuth Callback
export const handleLinkedinCallback = async (req: Request, res: Response) => {
  try {
    console.log("LinkedIn callback received:", {
      query: {
        state: req.query.state || "Missing",
        code: req.query.code ? "Present" : "Missing",
        error: req.query.error || "None",
      },
      session: req.session ? "Present" : "None",
      user: req.session?.user ? "Present" : "None",
      cookies: req.headers.cookie ? "Present" : "None",
    });

    // Check for error in the callback
    if (req.query.error) {
      console.error("LinkedIn OAuth error:", req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${
          req.query.error as string
        }`
      );
    }

    // Get code and state from query parameters
    const code = req.query.code;
    const state = req.query.state;

    if (!code) {
      console.error("No authorization code in callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=no_code`
      );
    }

    if (!state) {
      console.error("No state parameter in LinkedIn callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=no_state`
      );
    }

    // Retrieve state data from Redis
    const stateData = await redisService.get(`linkedin:${state as string}`);

    if (!stateData) {
      console.error(
        `No state data found in Redis for state: ${state as string}`
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=invalid_state`
      );
    }

    // Delete the state data from Redis as it's no longer needed
    await redisService.delete(`linkedin:${state as string}`);

    // Attach user data to request for the controller
    (req as any).user = {
      id: stateData.userId,
      email: stateData.email,
      organizationId: stateData.organizationId,
      teamIds: stateData.teamIds,
      currentTeamId: stateData.currentTeamId,
      role: stateData.role,
    };

    // Handle the callback with the controller
    return linkedinService.handleLinkedInCallback(req, res);
  } catch (error: any) {
    console.error("LinkedIn callback error:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/account-setup?error=${
        error.message ?? "unknown_error"
      }`
    );
  }
};
