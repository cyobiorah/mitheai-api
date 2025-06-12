import { Request, Response } from "express";
import * as youtubeService from "../../services/platforms/youtube.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";

// 1. Start YouTube OAuth
export const startDirectYoutubeAuth = async (req: any, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Generate a unique state ID
    const stateId = crypto.randomBytes(16).toString("hex");

    // Create state data object
    const stateData = {
      userId: req.user.id,
      email: req.user.email,
      organizationId: req.user.organizationId,
      currentTeamId: req.user.currentTeamId,
      timestamp: Date.now(),
    };

    // Store in Redis with 10 minute expiration
    await redisService.set(`youtube:${stateId}`, stateData, 600);

    const authUrl = await youtubeService.getAuthorizationUrl(stateId);

    res.send(authUrl);
  } catch (error: any) {
    console.error("YouTube direct auth error:", error);
    res.status(500).json({
      error: "Failed to initiate YouTube authentication",
      message: error.message ?? "Unknown error",
    });
  }
};

export const handleYoutubeCallback = async (req: Request, res: Response) => {
  try {
    if (req.query.error) {
      console.error("YouTube OAuth error:", req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/accounts?error=${
          req.query.error as string
        }`
      );
    }

    const code = req.query.code;
    const state = req.query.state;

    if (!code) {
      console.error("No authorization code in callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/accounts?error=no_code`
      );
    }

    if (!state) {
      console.error("No state parameter in YouTube callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/accounts?error=no_state`
      );
    }

    // Retrieve state data from Redis
    const stateData = await redisService.get(`youtube:${state as string}`);

    if (!stateData) {
      console.error(
        `No state data found in Redis for state: ${state as string}`
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/accounts?error=invalid_state`
      );
    }

    // Delete the state data from Redis as it's no longer needed
    await redisService.delete(`youtube:${state as string}`);

    (req as any).user = stateData;

    return youtubeService.handleYoutubeCallback(req, res);
  } catch (error: any) {
    console.error("YouTube callback error:", error);
    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/accounts?error=${error.message}`
    );
  }
};
