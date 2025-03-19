import { Request, Response } from "express";
import { TwitterService } from "../services/twitter.service";
import { firestore } from "firebase-admin";
import { Client, auth } from "twitter-api-sdk";
import { Timestamp } from "firebase-admin/firestore";
import { collections } from "../config/firebase";

export class SocialAccountController {
  private readonly twitterService: TwitterService;
  private readonly db: firestore.Firestore;

  constructor() {
    this.twitterService = new TwitterService();
    this.db = firestore();
  }

  async handleTwitterCallback(req: Request, res: Response) {
    try {
      if (req.query.error) {
        console.error("OAuth error:", req.query);
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings?error=${req.query.error}`
        );
      }

      // The Twitter account info is now in req.user from passport
      if (!req.user) {
        console.error("No authenticated user in request");
        return res.status(401).json({
          error: "Authentication required",
          message: "No authenticated user in request",
        });
      }

      const { account } = req.user as any;

      if (!account) {
        console.error("No account data in callback");
        return res.status(400).json({
          error: "No account data in callback",
          message: "No account data in callback",
        });
      }

      try {
        // Try to create the social account (this will check for duplicates)
        await this.twitterService.createSocialAccount(
          req.user.uid,
          account.profile,
          account.accessToken,
          account.refreshToken,
          req.user.organizationId,
          req.user.currentTeamId
        );

        // Redirect to the frontend settings page with success
        res.redirect(`${process.env.FRONTEND_URL}/settings?success=true`);
      } catch (error: any) {
        // Handle the case where the account is already connected
        if (error.code === "account_already_connected") {
          console.warn(
            "Attempted to connect already connected account:",
            error.details
          );

          // Encode error details for the frontend
          const errorDetails = encodeURIComponent(
            JSON.stringify({
              code: error.code,
              message: error.message,
              details: error.details,
            })
          );

          return res.redirect(
            `${process.env.FRONTEND_URL}/settings?error=account_already_connected&details=${errorDetails}`
          );
        }

        // Handle other errors
        console.error("Failed to create social account:", error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/settings?error=account_creation_failed&message=${encodeURIComponent(
            error.message || "Unknown error"
          )}`
        );
      }
    } catch (error: any) {
      console.error("Failed to handle Twitter callback:", error);
      res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=callback_failed&message=${encodeURIComponent(
          error.message || "Unknown error"
        )}`
      );
    }
  }

  async getSocialAccounts(userId: string) {
    try {
      const accountsSnapshot = await this.db
        .collection("social_accounts")
        .where("userId", "==", userId)
        .get();

      const accounts = accountsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return accounts;
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      throw error;
    }
  }

  async postTweet(req: Request, res: Response) {
    try {
      const { accountId, message } = req.body;

      if (!accountId || !message) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      try {
        // Always use v2 API since it's working reliably
        console.log(`Attempting to post tweet using v2 API from webapp...`);

        const tweet = await this.twitterService.postTweet(
          accountId,
          message,
          "v2"
        );
        res.json({ tweet });
      } catch (error) {
        console.error("Failed to post tweet:", error);

        if (error instanceof Error) {
          const errorMessage = error.message;

          // Handle authentication errors
          if (
            errorMessage.includes("refresh_token_expired") ||
            errorMessage.includes("reconnect account")
          ) {
            return res.status(401).json({
              error: "Account authentication expired",
              errorType: "auth_expired",
              message:
                "Your Twitter account needs to be reconnected. Please disconnect and reconnect your account.",
            });
          }

          // Handle Twitter API limitations - specifically check for our custom error message about API plans
          if (
            errorMessage.includes("TwitterPermissionError") &&
            errorMessage.includes("requires a paid Twitter API subscription")
          ) {
            return res.status(403).json({
              error: "Twitter API Plan Limitation",
              errorType: "api_plan_limitation",
              message:
                "Twitter requires a paid API subscription to post tweets. Only the welcome tweet during account linking is allowed with the free API tier.",
              details:
                "To enable tweet posting, an upgrade to Twitter's paid API plan is required.",
              actionRequired: "apiPlanUpgrade",
            });
          }

          // Handle general permission errors
          if (errorMessage.includes("TwitterPermissionError")) {
            return res.status(403).json({
              error: "Permission denied by Twitter",
              errorType: "permission_denied",
              message: errorMessage.replace("TwitterPermissionError: ", ""),
            });
          }

          // Handle rate limiting errors
          if (
            errorMessage.includes("TwitterRateLimitError") ||
            errorMessage.includes("rate limit")
          ) {
            return res.status(429).json({
              error: "Twitter rate limit exceeded",
              errorType: "rate_limit",
              message: "Twitter rate limit exceeded. Please try again later.",
            });
          }

          // Handle API errors
          if (errorMessage.includes("TwitterAPIError")) {
            const statusMatch = errorMessage.match(/(\d{3})/);
            const status = statusMatch ? parseInt(statusMatch[1]) : 500;

            return res.status(status).json({
              error: "Twitter API error",
              errorType: "api_error",
              message: errorMessage.replace("TwitterAPIError: ", ""),
            });
          }

          // Handle content validation errors (duplicates, etc.)
          if (errorMessage.includes("duplicate")) {
            return res.status(403).json({
              error: "Tweet content rejected",
              errorType: "content_rejected",
              message:
                "Tweet was rejected. This could be due to duplicate content or Twitter content policies.",
            });
          }
        }

        // Generic error for all other cases
        res.status(500).json({
          error: "Failed to post tweet",
          message: error instanceof Error ? error.message : "Unknown error",
          errorType: "posting_error",
        });
      }
    } catch (error) {
      console.error("Controller error in postTweet:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred in the server",
      });
    }
  }

  async scheduleTweet(req: Request, res: Response) {
    try {
      const { accountId, message, scheduledTime } = req.body;

      if (!accountId || !message || !scheduledTime) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      await this.twitterService.scheduleTweet(
        accountId,
        message,
        new Date(scheduledTime)
      );

      res.json({ success: true, message: "Tweet scheduled successfully" });
    } catch (error) {
      console.error("Failed to schedule tweet:", error);
      res.status(500).json({ error: "Failed to schedule tweet" });
    }
  }

  async initiateTwitterAuth(req: Request, res: Response) {
    try {
      const authUrl = await this.twitterService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error("Failed to get Twitter auth URL:", error);
      res
        .status(500)
        .json({ error: "Failed to initiate Twitter authentication" });
    }
  }

  async disconnectAccount(userId: string, accountId: string) {
    try {
      console.log(`Disconnecting account ${accountId} for user ${userId}`);
      
      // Find the specific account by ID and verify it belongs to the user
      const accountDoc = await this.db
        .collection("social_accounts")
        .doc(accountId)
        .get();

      if (!accountDoc.exists) {
        throw new Error(`Account ${accountId} not found`);
      }

      const accountData = accountDoc.data();
      if (accountData?.userId !== userId) {
        throw new Error("Unauthorized: Account belongs to a different user");
      }

      // Delete just this specific account
      await this.db.collection("social_accounts").doc(accountId).delete();
      
      console.log(`Successfully disconnected account ${accountId}`);
      return { success: true, message: "Account disconnected successfully" };
    } catch (error) {
      console.error(`Error disconnecting account ${accountId}:`, error);
      throw error;
    }
  }

  async debugTwitterConnection(req: Request, res: Response) {
    try {
      const { accountId } = req.body;

      if (!accountId) {
        // If no specific account ID is provided, get the user's first Twitter account
        const userId = req.user?.uid;
        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        const accountsSnapshot = await this.db
          .collection("social_accounts")
          .where("userId", "==", userId)
          .where("platform", "==", "twitter")
          .limit(1)
          .get();

        if (accountsSnapshot.empty) {
          return res
            .status(404)
            .json({ error: "No Twitter account found for this user" });
        }

        const userAccountId = accountsSnapshot.docs[0].id;

        // Test the connection
        const results = await this.twitterService.debugTwitterConnection(
          userAccountId
        );
        return res.json({
          ...results,
          accountId: userAccountId,
          accountName: accountsSnapshot.docs[0].data().accountName,
        });
      }

      // If specific account ID is provided, test that account
      const results = await this.twitterService.debugTwitterConnection(
        accountId
      );
      res.json(results);
    } catch (error) {
      console.error("Failed to debug Twitter connection:", error);
      res.status(500).json({
        error: "Failed to test Twitter connectivity",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async debugTwitterAccount(req: Request, res: Response) {
    try {
      const { accountId } = req.params;

      if (!accountId) {
        return res
          .status(400)
          .json({ error: "Missing required parameter: accountId" });
      }

      // Get account and token info using the public getSocialAccount method
      const account = await this.twitterService.getSocialAccount(accountId);

      if (!account) {
        return res.status(404).json({ error: "Twitter account not found" });
      }

      const results = {
        accountInfo: {
          id: account.id,
          platform: account.platform,
          accountName: account.accountName,
          tokenType: typeof account.accessToken,
          hasRefreshToken: !!account.refreshToken,
          tokenExpiry: account.tokenExpiry ? "exists" : "null",
          permissions: account.permissions,
        },
        userDataTest: { success: false, data: null as any, error: null as any },
        postingTest: { success: false, data: null as any, error: null as any },
        apiCapabilities: await this.twitterService.checkApiCapabilities(
          accountId
        ),
        tokenData: {
          accessTokenStart: account.accessToken
            ? account.accessToken.substring(0, 10) + "..."
            : "none",
          refreshTokenStart: account.refreshToken
            ? account.refreshToken.substring(0, 10) + "..."
            : "none",
        },
      };

      // 1. Test fetching user data (should work even with limited permissions)
      try {
        const client = new Client(new auth.OAuth2Bearer(account.accessToken));
        const userData = await client.users.findMyUser();
        results.userDataTest.success = true;
        results.userDataTest.data = userData;
      } catch (userError: any) {
        results.userDataTest.success = false;
        results.userDataTest.error = userError.message || "Unknown error";
      }

      // 2. Test posting a tweet
      try {
        const testMessage = `Testing MitheAI connection... ${new Date().toISOString()}`;
        const tweet = await this.twitterService.postTweet(
          accountId,
          testMessage,
          "v2"
        );
        results.postingTest.success = true;
        results.postingTest.data = tweet;
      } catch (postError: any) {
        results.postingTest.success = false;
        results.postingTest.error = postError.message || "Unknown error";
      }

      res.json(results);
    } catch (error) {
      console.error("Error debugging Twitter account:", error);
      res.status(500).json({
        error: "Error debugging Twitter account",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async assignTeam(req: Request, res: Response) {
    try {
      const { accountId } = req.params;
      const { teamId } = req.body;

      // Validate team exists and user has access
      const teamRef = collections.teams.doc(teamId);
      const team = await teamRef.get();

      if (!team.exists) {
        return res.status(404).json({ error: "Team not found" });
      }

      const teamData = team.data();
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (teamData?.organizationId !== req.user.organizationId) {
        return res
          .status(403)
          .json({ error: "Not authorized to assign to this team" });
      }

      // Update social account
      await this.db.collection("social_accounts").doc(accountId).update({
        teamId,
        updatedAt: Timestamp.now(),
      });

      res.json({ message: "Team assigned successfully" });
    } catch (error) {
      console.error("Error assigning team:", error);
      res.status(500).json({ error: "Failed to assign team" });
    }
  }
}
