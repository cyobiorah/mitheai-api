import { Request, Response as ExpressResponse } from "express";
import * as threadsService from "../../services/platforms/threads.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";
import { getCollections } from "../../config/db";

// 1. Start Threads OAuth
export const startDirectThreadsAuth = async (
  req: any,
  res: ExpressResponse
) => {
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

    res.send(authUrl);
  } catch (error) {
    console.error("Error in Threads direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//2. Start Threads Connect
export const startThreadsConnect = async (req: any, res: ExpressResponse) => {
  // Check for state parameter
  const { state } = req.query;

  if (!state) {
    console.error("No state parameter found in Threads connect request");
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent(
        "Missing state parameter"
      )}`
    );
  }

  try {
    // Retrieve state data from Redis
    const stateData = await redisService.get(`threads:${state as string}`);

    if (!stateData) {
      console.error("No state data found in Redis for Threads connect");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "Invalid or expired state"
        )}`
      );
    }

    // Check for timestamp expiration (10 minute window)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`threads:${state as string}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "Authentication link expired"
        )}`
      );
    }

    // Set up Threads OAuth URL with proper scopes
    const threadsAuthUrl = new URL("https://threads.net/oauth/authorize");
    threadsAuthUrl.searchParams.append(
      "client_id",
      process.env.THREADS_APP_ID!
    );
    threadsAuthUrl.searchParams.append(
      "redirect_uri",
      process.env.THREADS_CALLBACK_URL!
    );
    threadsAuthUrl.searchParams.append("response_type", "code");
    threadsAuthUrl.searchParams.append(
      "scope",
      "threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights"
    );
    threadsAuthUrl.searchParams.append("state", state as string);

    res.redirect(threadsAuthUrl.toString());
  } catch (error) {
    console.error("Error in Threads connect:", error);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent("Internal server error")}`
    );
  }
};

// 3. Threads OAuth Callback
export const handleThreadsCallback = async (
  req: Request,
  res: ExpressResponse
) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle errors from Threads
    if (error) {
      console.error("Threads OAuth error:", error, error_description);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          (error_description as string) ?? "Authentication failed"
        )}`
      );
    }

    // Check for required parameters
    if (!code || !state) {
      console.error("Missing code or state in Threads callback");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "Missing required parameters"
        )}`
      );
    }

    // Try to retrieve state data from Redis
    const stateData = await redisService.get(`threads:${state as string}`);

    if (!stateData) {
      console.error(
        `No state data found in Redis for state: ${state as string}`
      );
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
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
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "User identification failed"
        )}`
      );
    }

    try {
      // Exchange the code for an access token
      const accessToken = await threadsService.exchangeCodeForToken(
        code as string
      );

      if (!accessToken) {
        console.error("Failed to exchange code for token");
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/dashboard/accounts?error=${encodeURIComponent(
            "Failed to authenticate with Threads"
          )}`
        );
      }

      // Get user profile from Threads
      const userProfile = await threadsService.getUserProfile(accessToken);

      if (!userProfile?.id) {
        console.error("Failed to get user profile:", userProfile);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/dashboard/accounts?error=${encodeURIComponent(
            "Failed to retrieve Threads profile"
          )}`
        );
      }

      // Create or update the social account
      await threadsService.createSocialAccount(
        userId,
        userProfile,
        accessToken,
        "", // Threads doesn't provide refresh tokens in this flow
        organizationId,
        currentTeamId
      );

      // Clean up Redis state
      await redisService.delete(`threads:${state as string}`);

      // Redirect to settings page with success
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/accounts?success=true`
      );
    } catch (error: any) {
      console.error("Error in Threads callback:", error);

      // Handle duplicate account error
      if (
        error.code === "ACCOUNT_ALREADY_LINKED" ||
        error.code === "account_already_connected"
      ) {
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/dashboard/accounts?error=${encodeURIComponent(
            error.message ??
              "This Threads account is already connected to another user"
          )}`
        );
      }

      // Handle other errors
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          error.message ?? "Failed to connect Threads account"
        )}`
      );
    }
  } catch (error: any) {
    console.error("Unexpected error in Threads callback:", error);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent(
        error.message ?? "An unexpected error occurred"
      )}`
    );
  }
};

export const postToThreads = async ({
  res,
  postData,
}: {
  res?: ExpressResponse;
  postData: any;
}) => {
  try {
    const {
      accountId,
      content,
      mediaUrls = [],
      mediaType = "TEXT",
      userId,
      user,
    } = postData;

    if (!accountId) {
      const msg = "Account ID is required";
      return (
        res?.status(400).json({ status: "error", message: msg }) ?? {
          success: false,
          error: msg,
        }
      );
    }

    if (!userId) {
      const msg = "Authentication required";
      return (
        res?.status(401).json({ status: "error", message: msg }) ?? {
          success: false,
          error: msg,
        }
      );
    }

    const account = await threadsService.getAccountWithValidToken(accountId);
    if (!account) {
      const msg = "Social account not found";
      return (
        res?.status(404).json({ status: "error", message: msg }) ?? {
          success: false,
          error: msg,
        }
      );
    }

    const hasAccess =
      String(account.userId) === String(userId) ||
      (account.organizationId &&
        user?.organizationId &&
        String(account.organizationId) === String(user.organizationId)) ||
      (account.teamId && user?.teamIds?.includes(account.teamId.toString())) ||
      user?.role === "super_admin";

    if (!hasAccess) {
      const msg = "You do not have permission to post with this account";
      return (
        res?.status(403).json({ status: "error", message: msg }) ?? {
          success: false,
          error: msg,
        }
      );
    }

    const postResult = await threadsService.postToThreads({
      accountId,
      content,
      mediaUrls,
    });

    if (!postResult.success) {
      if (postResult.error?.includes("token has expired")) {
        const err = {
          status: "error",
          code: "TOKEN_EXPIRED",
          message: postResult.error,
          accountId,
          platform: "threads",
          requiresReconnect: true,
        };
        return res?.status(401).json(err) ?? { success: false, ...err };
      }

      const err = {
        status: "error",
        message: postResult.error ?? "Failed to post to Threads",
      };
      return res?.status(400).json(err) ?? { success: false, ...err };
    }

    // Save to DB (don't block on failure)
    try {
      const { socialposts } = await getCollections();
      await socialposts.insertOne({
        userId: account.userId,
        teamId: account.teamId,
        organizationId: account.organizationId,
        socialAccountId: accountId,
        platform: "threads",
        content,
        mediaType,
        mediaUrls,
        accountId: account.accountId,
        metadata: {
          mediaType,
          mediaUrls,
          accountName: account.accountName,
          platform: "threads",
          profileImageUrl:
            account.metadata?.profile?.threads_profile_picture_url,
        },
        postId: postResult.id,
        status: "published",
        publishedDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error("Error saving post to DB:", err);
    }

    return (
      res?.status(200).json({ status: "success", data: postResult.id }) ?? {
        success: true,
        postId: postResult.id,
      }
    );
  } catch (error: any) {
    console.error("Unexpected error in Threads post:", error);
    const msg = error.message ?? "An unexpected error occurred";
    return (
      res?.status(500).json({ status: "error", message: msg }) ?? {
        success: false,
        error: msg,
      }
    );
  }
};
