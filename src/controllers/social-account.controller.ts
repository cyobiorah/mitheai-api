import { Request, Response } from "express";
import { TwitterService } from "../services/twitter.service";
import { SocialAccountService } from "../services/social-account.service";
import { Client, auth } from "twitter-api-sdk";

export class SocialAccountController {
  private readonly twitterService: TwitterService;
  private readonly socialAccountService: SocialAccountService;

  constructor() {
    this.twitterService = new TwitterService();
    this.socialAccountService = new SocialAccountService();
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
      const accounts = await this.socialAccountService.findByUser(userId);
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
        }

        // Generic error response for unhandled errors
        return res.status(500).json({
          error: "Failed to post tweet",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      console.error("Error in postTweet controller:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getUserSocialAccounts(req: Request, res: Response) {
    try {
      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const accounts = await this.socialAccountService.findByUser(userId);
      
      // Filter out sensitive information
      const safeAccounts = accounts.map((account) => {
        const { accessToken, refreshToken, ...safeAccount } = account;
        return safeAccount;
      });

      res.json(safeAccounts);
    } catch (error) {
      console.error("Error fetching user social accounts:", error);
      res.status(500).json({
        error: "Failed to fetch social accounts",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getOrganizationSocialAccounts(req: Request, res: Response) {
    try {
      const { organizationId } = req.params;

      if (!organizationId) {
        return res.status(400).json({
          error: "Missing required parameter: organizationId",
        });
      }

      // Check if user belongs to the organization
      if (req.user?.organizationId !== organizationId) {
        return res.status(403).json({
          error: "Access denied",
          message: "You do not have access to this organization's accounts",
        });
      }

      const accounts = await this.socialAccountService.findByOrganization(organizationId);
      
      // Filter out sensitive information
      const safeAccounts = accounts.map((account) => {
        const { accessToken, refreshToken, ...safeAccount } = account;
        return safeAccount;
      });

      res.json(safeAccounts);
    } catch (error) {
      console.error("Error fetching organization social accounts:", error);
      res.status(500).json({
        error: "Failed to fetch social accounts",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getTeamSocialAccounts(req: Request, res: Response) {
    try {
      const { teamId } = req.params;

      if (!teamId) {
        return res.status(400).json({
          error: "Missing required parameter: teamId",
        });
      }

      // Check if user belongs to the team
      if (!req.user?.teamIds?.includes(teamId)) {
        return res.status(403).json({
          error: "Access denied",
          message: "You do not have access to this team's accounts",
        });
      }

      const accounts = await this.socialAccountService.findByTeam(teamId);
      
      // Filter out sensitive information
      const safeAccounts = accounts.map((account) => {
        const { accessToken, refreshToken, ...safeAccount } = account;
        return safeAccount;
      });

      res.json(safeAccounts);
    } catch (error) {
      console.error("Error fetching team social accounts:", error);
      res.status(500).json({
        error: "Failed to fetch social accounts",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async disconnectSocialAccount(req: Request, res: Response) {
    try {
      const { accountId } = req.params;

      if (!accountId) {
        return res.status(400).json({
          error: "Missing required parameter: accountId",
        });
      }

      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Get the account to check ownership
      const account = await this.socialAccountService.findById(accountId);

      if (!account) {
        return res.status(404).json({ error: "Social account not found" });
      }

      // Check if user owns the account or has organization access
      const hasAccess =
        account.userId === userId ||
        (req.user?.organizationId === account.organizationId &&
          req.user?.role === "org_owner");

      if (!hasAccess) {
        return res.status(403).json({
          error: "Access denied",
          message: "You do not have permission to disconnect this account",
        });
      }

      // Delete the account
      await this.socialAccountService.delete(accountId);

      res.json({ message: "Social account disconnected successfully" });
    } catch (error) {
      console.error("Error disconnecting social account:", error);
      res.status(500).json({
        error: "Failed to disconnect social account",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async scheduleTweet(req: Request, res: Response) {
    try {
      // Placeholder implementation
      res.status(501).json({ 
        message: "This method is not implemented in the MongoDB version yet",
        info: "Tweet scheduling will be implemented in a future update"
      });
    } catch (error) {
      console.error("Error in scheduleTweet:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async debugTwitterConnection(req: Request, res: Response) {
    try {
      // Placeholder implementation
      res.status(501).json({ 
        message: "This method is not implemented in the MongoDB version yet",
        info: "Twitter connection debugging will be implemented in a future update"
      });
    } catch (error) {
      console.error("Error in debugTwitterConnection:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async debugTwitterAccount(req: Request, res: Response) {
    try {
      // Placeholder implementation
      res.status(501).json({ 
        message: "This method is not implemented in the MongoDB version yet",
        info: "Twitter account debugging will be implemented in a future update"
      });
    } catch (error) {
      console.error("Error in debugTwitterAccount:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async assignTeam(req: Request, res: Response) {
    try {
      const { accountId } = req.params;
      const { teamId } = req.body;

      if (!accountId || !teamId) {
        return res.status(400).json({ 
          error: "Missing required parameters",
          message: "Both accountId and teamId are required"
        });
      }

      // Get the account to check if it exists
      const account = await this.socialAccountService.findById(accountId);
      
      if (!account) {
        return res.status(404).json({ error: "Social account not found" });
      }

      // Update the account with the new team ID
      await this.socialAccountService.update(accountId, { 
        teamId,
        updatedAt: new Date()
      });

      res.json({ message: "Team assigned successfully" });
    } catch (error) {
      console.error("Error assigning team:", error);
      res.status(500).json({
        error: "Failed to assign team",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Getter methods to expose services
  getTwitterService(): TwitterService {
    return this.twitterService;
  }

  getSocialAccountService(): SocialAccountService {
    return this.socialAccountService;
  }
}
