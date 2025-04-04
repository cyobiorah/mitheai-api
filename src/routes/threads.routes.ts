import express from "express";
import { ThreadsService } from "../services/threads.service";
import { authenticateToken } from "../middleware/auth.middleware";
import { RepositoryFactory } from "../repositories/repository.factory";
import { isOrganizationUser } from "../app-types";
import * as crypto from "crypto";
import redisService from "../services/redis.service";
import { SocialPost } from "../models/social-post.model";

const router = express.Router();
const threadsService = new ThreadsService();

// Direct auth route for Threads
router.get("/threads/direct-auth", authenticateToken, async (req: any, res) => {
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
});

/**
 * Initialize Threads connection - redirects to Threads OAuth
 * According to Meta documentation, Threads API is accessed through Threads OAuth:
 * https://developers.facebook.com/docs/threads/get-started
 */
router.get("/threads/connect", async (req, res) => {
  // console.log("Threads connect request:", {
  //   query: req.query,
  //   headers: {
  //     authorization: req.headers.authorization ? "Present" : "Missing",
  //     cookie: req.headers.cookie ? "Present" : "Missing",
  //   },
  //   sessionID: req.sessionID,
  //   hasSession: !!req.session,
  // });

  // Check for state parameter
  const { state } = req.query;

  if (!state) {
    console.error("No state parameter found in Threads connect request");
    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
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
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          "Invalid or expired state"
        )}`
      );
    }

    // Check for timestamp expiration (10 minute window)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`threads:${state as string}`);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
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
      `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
        "Internal server error"
      )}`
    );
  }
});

/**
 * Threads callback - handles the OAuth callback from Threads
 */
router.get("/threads/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // console.log("Threads callback received:", {
    //   query: req.query,
    //   headers: {
    //     authorization: req.headers.authorization ? "Present" : "Missing",
    //     cookie: req.headers.cookie ? "Present" : "Missing",
    //   },
    //   sessionID: req.sessionID,
    //   hasSession: !!req.session,
    //   stateParam: state || "Missing",
    // });

    // Handle errors from Threads
    if (error) {
      console.error("Threads OAuth error:", error, error_description);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          error_description?.toString() || "Authentication failed"
        )}`
      );
    }

    // Check for required parameters
    if (!code || !state) {
      console.error("Missing code or state in Threads callback");
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          "Missing required parameters"
        )}`
      );
    }

    // Try to retrieve state data from Redis
    const stateData = await redisService.get(`threads:${state as string}`);

    console.log(
      `Threads callback: Retrieved state data for state ${state}:`,
      stateData
    );

    if (!stateData) {
      console.error(`No state data found in Redis for state: ${state}`);
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          "Invalid or expired authentication link"
        )}`
      );
    }

    // Get user ID from state data
    const userId = stateData.uid;
    const organizationId = stateData.organizationId;
    const currentTeamId = stateData.currentTeamId;

    if (!userId) {
      console.error("No user ID found in state data");
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
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
        code.toString() as string
      );

      if (!accessToken) {
        console.error("Failed to exchange code for token");
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
            "Failed to authenticate with Threads"
          )}`
        );
      }

      // Get user profile from Threads
      const userProfile = await threadsService.getUserProfile(accessToken);

      if (!userProfile?.id) {
        console.error("Failed to get user profile:", userProfile);
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
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

      console.log("Threads account connected successfully:", account.id);

      // Redirect to settings page with success
      return res.redirect(`${process.env.FRONTEND_URL}/settings?success=true`);
    } catch (error: any) {
      console.error("Error in Threads callback:", error);

      // Handle duplicate account error
      if (
        error.code === "ACCOUNT_ALREADY_LINKED" ||
        error.code === "account_already_connected"
      ) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
            error.message ||
              "This Threads account is already connected to another user"
          )}`
        );
      }

      // Handle other errors
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
          error.message || "Failed to connect Threads account"
        )}`
      );
    }
  } catch (error: any) {
    console.error("Unexpected error in Threads callback:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/settings?error=${encodeURIComponent(
        error.message || "An unexpected error occurred"
      )}`
    );
  }
});

/**
 * Create a post on Threads
 * Uses the Threads Graph API to create a post on Threads
 * https://developers.facebook.com/docs/threads/create-posts
 */
router.post(
  "/threads/:accountId/post",
  authenticateToken,
  async (req: any, res) => {
    try {
      const { accountId } = req.params;
      const { content, mediaUrls, mediaType = "TEXT" } = req.body;

      // Validate request
      if (!accountId) {
        return res.status(400).json({
          status: "error",
          message: "Account ID is required",
        });
      }

      if (!content && (!mediaUrls || mediaUrls.length === 0)) {
        return res.status(400).json({
          status: "error",
          message: "Content or media is required",
        });
      }

      // Validate mediaType
      if (!["TEXT", "IMAGE", "VIDEO", "CAROUSEL"].includes(mediaType)) {
        return res.status(400).json({
          status: "error",
          message:
            "Invalid media type. Must be one of: TEXT, IMAGE, VIDEO, CAROUSEL",
        });
      }

      // Validate media configuration
      if (mediaType === "IMAGE" || mediaType === "VIDEO") {
        if (!mediaUrls || mediaUrls.length !== 1) {
          return res.status(400).json({
            status: "error",
            message: `${mediaType} posts require exactly one media URL`,
          });
        }
      } else if (mediaType === "CAROUSEL") {
        if (!mediaUrls || mediaUrls.length < 2 || mediaUrls.length > 20) {
          return res.status(400).json({
            status: "error",
            message: "CAROUSEL posts require between 2 and 20 media URLs",
          });
        }
      }

      // Get user ID from the authenticated request
      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      try {
        // Get the social account using the repository
        const account = await threadsService.getAccountWithValidToken(
          accountId
        );

        if (!account) {
          return res.status(404).json({
            status: "error",
            message: "Social account not found",
          });
        }

        // Security check: Verify the account belongs to the authenticated user
        // Unless the user is an admin or belongs to the organization/team
        if (account.userId !== userId) {
          // The user object is already available from the authenticateToken middleware
          const user = req.user;

          if (!user) {
            return res.status(401).json({
              status: "error",
              message: "Authentication failed",
            });
          }

          const hasAccess =
            (account.organizationId &&
              isOrganizationUser(user) &&
              account.organizationId === user.organizationId) ||
            (account.teamId &&
              isOrganizationUser(user) &&
              user.teamIds?.includes(account.teamId)) ||
            user.role === "super_admin";

          if (!hasAccess) {
            return res.status(403).json({
              status: "error",
              message: "You do not have permission to post with this account",
            });
          }
        }

        // Post to Threads using the account
        const postResult = await threadsService.postContent(
          accountId,
          content,
          mediaType as "TEXT" | "IMAGE" | "VIDEO",
          mediaUrls?.[0]
        );

        // Check if posting was successful
        if (!postResult.success) {
          // Handle specific error cases
          if (postResult.error?.includes("token has expired")) {
            return res.status(401).json({
              status: "error",
              code: "TOKEN_EXPIRED",
              message: postResult.error,
              accountId,
              platform: "threads",
              requiresReconnect: true,
            });
          }
          
          return res.status(400).json({
            status: "error",
            message: postResult.error || "Failed to post to Threads",
          });
        }

        // Save the post to the database for analytics and tracking
        try {
          const socialPostRepository =
            await RepositoryFactory.createSocialPostRepository();

          const socialPost: SocialPost = {
            userId: account.userId,
            teamId: account.teamId,
            organizationId: account.organizationId,
            socialAccountId: accountId,
            platform: "threads",
            content: content,
            mediaType: mediaType || "TEXT",
            mediaUrls: mediaUrls,
            postId: postResult.postId,
            status: "published",
            publishedDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          await socialPostRepository.createPost(socialPost);
          console.log(`Saved Threads post to database for analytics tracking`);
        } catch (saveError) {
          // Don't fail the post if saving to the database fails
          console.error("Error saving Threads post to database:", saveError);
        }

        // Return the post details
        return res.status(200).json({
          status: "success",
          data: postResult.postId,
        });
      } catch (error: any) {
        console.error("Error posting to Threads:", error);

        // Handle specific error types
        if (error.message?.includes("Media uploads")) {
          return res.status(400).json({
            status: "error",
            message: error.message,
            code: "MEDIA_NOT_SUPPORTED",
          });
        }

        // Return appropriate error response
        return res.status(error.response?.status || 500).json({
          status: "error",
          message:
            error.message || "An error occurred while posting to Threads",
          details: error.response?.data || null,
        });
      }
    } catch (error: any) {
      console.error("Unexpected error in Threads post:", error);
      return res.status(500).json({
        status: "error",
        message: "An unexpected error occurred",
      });
    }
  }
);

export default router;
