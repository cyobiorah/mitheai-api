import { Request, Response } from "express";
import * as threadsService from "../../services/platforms/threads.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";

//1. Start Threads Connect
export const startThreadsConnect = async (req: any, res: Response) => {
  // Check for state parameter
  const { state } = req.query;

  if (!state) {
    console.error("No state parameter found in Threads connect request");
    return res.redirect(
      `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
        "Missing state parameter"
      )}`
    );
  }

  try {
    // Retrieve state data from Redis
    const stateData = await redisService.get(`threads:${state as string}`);

    console.log(
      `Threads connect: Retrieved state data for state ${state}:`,
      stateData
    );

    if (!stateData) {
      console.error("No state data found in Redis for Threads connect");
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          "Invalid or expired state"
        )}`
      );
    }

    // Check for timestamp expiration (10 minute window)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`threads:${state as string}`);
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          "Authentication link expired"
        )}`
      );
    }

    // Set up Threads OAuth URL with proper scopes
    const threadsAuthUrl = new URL("https://threads.net/oauth/authorize");
    threadsAuthUrl.searchParams.append(
      "client_id",
      process.env.THREADS_APP_ID ?? ""
    );
    threadsAuthUrl.searchParams.append(
      "redirect_uri",
      process.env.THREADS_CALLBACK_URL ??
        "http://localhost:3001/api/social-accounts/threads/callback"
    );
    threadsAuthUrl.searchParams.append("response_type", "code");
    threadsAuthUrl.searchParams.append(
      "scope",
      "threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights"
    );
    threadsAuthUrl.searchParams.append("state", state as string);

    console.log("Redirecting to Threads OAuth:", threadsAuthUrl.toString());
    res.redirect(threadsAuthUrl.toString());
  } catch (error) {
    console.error("Error in Threads connect:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
        "Internal server error"
      )}`
    );
  }
};

// 1. Start Threads OAuth
export const startDirectThreadsAuth = async (req: any, res: Response) => {
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
    await redisService.set(`threads:${stateId}`, stateData, 600);

    // Return the full URL with state parameter
    const baseUrl = process.env.API_URL ?? "http://localhost:3001";
    const authUrl = `${baseUrl}/api/social-accounts/threads/connect?state=${stateId}`;

    console.log(
      `Threads direct-auth: Generated state ID ${stateId} for user ${req.user.uid}`
    );
    console.log(`Threads direct-auth: Redirecting to ${authUrl}`);

    res.send(authUrl);
  } catch (error) {
    console.error("Error in Threads direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 2. Threads OAuth Callback
export const handleThreadsCallback = async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle errors from Threads
    if (error) {
      console.error("Threads OAuth error:", error, error_description);
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          (error_description as string) ?? "Authentication failed"
        )}`
      );
    }

    // Check for required parameters
    if (!code || !state) {
      console.error("Missing code or state in Threads callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          "Missing required parameters"
        )}`
      );
    }

    // Try to retrieve state data from Redis
    const stateData = await redisService.get(`threads:${state as string}`);

    console.log(
      `Threads callback: Retrieved state data for state ${state as string}:`,
      stateData
    );

    if (!stateData) {
      console.error(
        `No state data found in Redis for state: ${state as string}`
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          "Invalid or expired authentication link"
        )}`
      );
    }

    // Get user ID from state data
    const userId = stateData.userId;
    const organizationId = stateData.organizationId;
    const currentTeamId = stateData.currentTeamId;

    if (!userId) {
      console.error("No user ID found in state data");
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          "User identification failed"
        )}`
      );
    }

    console.log(
      `Threads callback: Using user ID ${userId} from Redis state data`
    );

    try {
      // Exchange the code for an access token
      const accessToken = await threadsService.exchangeCodeForToken(
        code as string
      );

      if (!accessToken) {
        console.error("Failed to exchange code for token");
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
            "Failed to authenticate with Threads"
          )}`
        );
      }

      // Get user profile from Threads
      const userProfile = await threadsService.getUserProfile(accessToken);

      if (!userProfile?.id) {
        console.error("Failed to get user profile:", userProfile);
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
            "Failed to retrieve Threads profile"
          )}`
        );
      }

      // Create or update the social account
      const account = await threadsService.createSocialAccount(
        userId,
        userProfile,
        accessToken,
        "", // Threads doesn't provide refresh tokens in this flow
        organizationId,
        currentTeamId
      );

      // Clean up Redis state
      await redisService.delete(`threads:${state as string}`);

      console.log("Threads account connected successfully:", account);

      // Redirect to settings page with success
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?success=true`
      );
    } catch (error: any) {
      console.error("Error in Threads callback:", error);

      // Handle duplicate account error
      if (
        error.code === "ACCOUNT_ALREADY_LINKED" ||
        error.code === "account_already_connected"
      ) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
            error.message ??
              "This Threads account is already connected to another user"
          )}`
        );
      }

      // Handle other errors
      return res.redirect(
        `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
          error.message ?? "Failed to connect Threads account"
        )}`
      );
    }
  } catch (error: any) {
    console.error("Unexpected error in Threads callback:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/account-setup?error=${encodeURIComponent(
        error.message ?? "An unexpected error occurred"
      )}`
    );
  }
};
