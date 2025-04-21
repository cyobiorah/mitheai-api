import { Request, Response } from "express";
import * as linkedinService from "../../services/platforms/linkedin.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

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

export const post = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { content } = req.body;
    const userId = (req as any).user?.id;

    // Validate request
    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "Account ID is required",
      });
    }

    if (!content) {
      return res.status(400).json({
        status: "error",
        message: "Content is required",
      });
    }

    // Validate user
    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    // Validate account

    try {
      const { socialaccounts } = await getCollections();
      const account = await socialaccounts.findOne({
        _id: new ObjectId(accountId),
      });
      if (!account) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      if (account.userId.toString() !== userId) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized to post to this account",
        });
      }

      const result = await linkedinService.postContent(accountId, content);

      return res.status(200).json({
        status: "success",
        message: "Successfully posted to LinkedIn",
        data: result,
      });
    } catch (error: any) {
      console.error("Error posting to LinkedIn:", error);

      // Handle specific error types
      if (error.code === "TOKEN_EXPIRED") {
        return res.status(401).json({
          status: "error",
          message:
            "LinkedIn access token has expired. Please reconnect your account.",
        });
      }

      if (error.code === "ACCOUNT_NOT_FOUND") {
        return res.status(404).json({
          status: "error",
          message: "LinkedIn account not found",
        });
      }

      return res.status(500).json({
        status: "error",
        message: error.message ?? "Failed to post to LinkedIn",
      });
    }
  } catch (error) {
    console.error("Unexpected error in LinkedIn post route:", error);
    return res.status(500).json({
      status: "error",
      message: "An unexpected error occurred",
    });
  }
};
