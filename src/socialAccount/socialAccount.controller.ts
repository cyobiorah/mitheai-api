import { Request, Response } from "express";
import { TwitterService } from "../platforms/twitter/twitter.service";
import { SocialAccountService } from "./socialAccount.service";
import { LinkedInService } from "../platforms/linkedin/linkedin.service";
import { ObjectId } from "mongodb";
import { RepositoryFactory } from "../repositories/repository.factory";

export class SocialAccountController {
  private readonly twitterService: TwitterService;
  private readonly socialAccountService: SocialAccountService;
  private readonly linkedInService: LinkedInService;

  constructor() {
    this.twitterService = new TwitterService();
    this.socialAccountService = new SocialAccountService();
    this.linkedInService = new LinkedInService();
  }

  async handleTwitterCallback(req: Request, res: Response) {
    try {
      if (req.query.error) {
        console.error("OAuth error:", req.query);
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=${
            req.query.error as any
          }`
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

      const { account } = req.user;

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
        res.redirect(`${process.env.FRONTEND_URL}/account-setup?success=true`);
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
            `${process.env.FRONTEND_URL}/account-setup?error=account_already_connected&details=${errorDetails}`
          );
        }

        // Handle other errors
        console.error("Failed to create social account:", error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/account-setup?error=account_creation_failed&message=${encodeURIComponent(
            error.message || "Unknown error"
          )}`
        );
      }
    } catch (error: any) {
      console.error("Failed to handle Twitter callback:", error);
      res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=callback_failed&message=${encodeURIComponent(
          error.message || "Unknown error"
        )}`
      );
    }
  }

  // async getSocialAccounts(userId: string) {
  //   try {
  //     const accounts = await this.socialAccountService.findByUser(userId);
  //     return accounts;
  //   } catch (error) {
  //     console.error("Error fetching social accounts:", error);
  //     throw error;
  //   }
  // }

  async getSocialAccounts(req: any, res: any) {
    try {
      const { organizationId } = req.user;
      if (!organizationId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Call repository with all possible ownership fields
      const accounts = await this.socialAccountService.findAccessibleAccounts(
        organizationId
      );
      console.log({ accounts });
      res.json(accounts ?? []);
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      res.status(500).json({ error: "Failed to fetch social accounts" });
    }
  }

  // eslint-disable-next-line
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

      const accounts = await this.socialAccountService.findByOrganization(
        organizationId
      );

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

      // console.log(`[DEBUG] Disconnect request for accountId: ${accountId}`);

      const userId = req.user?.uid;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Try to find the account directly in the MongoDB collection
      try {
        // Get direct access to the collection
        const db = await RepositoryFactory.getDatabase();
        const collection = db.collection("socialAccounts");

        // Try multiple lookup strategies
        let foundAccount = null;

        // Try with ObjectId first
        try {
          // console.log(`[DEBUG] Trying with MongoDB ObjectId`);
          foundAccount = await collection.findOne({
            _id: new ObjectId(accountId),
          });
          // console.log(
          //   `[DEBUG] ObjectId lookup result:`,
          //   foundAccount ? "Found" : "Not found"
          // );
        } catch (objIdError: any) {
          console.log(`[DEBUG] Error creating ObjectId:`, objIdError.message);
          // Continue to other lookup methods
        }

        // Try with string _id (in case it's stored as string) - this is what worked!
        if (!foundAccount) {
          // console.log(`[DEBUG] Trying with _id as string`);
          foundAccount = await collection.findOne({ _id: accountId as any });
          // console.log(
          //   `[DEBUG] String _id lookup result:`,
          //   foundAccount ? "Found" : "Not found"
          // );
        }

        if (!foundAccount) {
          // console.log(`[DEBUG] All lookup attempts failed, account not found`);
          return res.status(404).json({ error: "Social account not found" });
        }

        // console.log(`[DEBUG] Found account:`, foundAccount._id.toString());

        // Check if user owns the account or has organization access
        const hasAccess =
          foundAccount.userId === userId ||
          (req.user?.organizationId === foundAccount.organizationId &&
            req.user?.role === "org_owner");

        if (!hasAccess) {
          return res.status(403).json({
            error: "Access denied",
            message: "You do not have permission to disconnect this account",
          });
        }

        // Delete the account using the found MongoDB ObjectId
        // console.log(
        //   `[DEBUG] Deleting account with ObjectId: ${foundAccount._id}`
        // );
        const result = await collection.deleteOne({ _id: foundAccount._id });

        if (result.deletedCount === 0) {
          // console.log(
          //   `[DEBUG] Failed to delete account with ID: ${foundAccount._id}`
          // );
          return res
            .status(500)
            .json({ error: "Failed to disconnect account" });
        }

        // console.log(
        //   `[DEBUG] Successfully deleted account with ID: ${foundAccount._id}`
        // );
        return res.json({
          message: "Social account disconnected successfully",
        });
      } catch (dbError) {
        console.error(`[DEBUG] Database error:`, dbError);
        return res.status(500).json({
          error: "Failed to disconnect account",
          message: dbError instanceof Error ? dbError.message : String(dbError),
        });
      }
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
        info: "Tweet scheduling will be implemented in a future update",
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
        info: "Twitter connection debugging will be implemented in a future update",
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
        info: "Twitter account debugging will be implemented in a future update",
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
          message: "Both accountId and teamId are required",
        });
      }

      // Get the account to check if it exists
      const account = await this.socialAccountService.findById(accountId);

      if (!account) {
        return res.status(404).json({ error: "Social account not found" });
      }

      console.log({ account });

      // Update the account with the new team ID
      await this.socialAccountService.update(accountId, {
        teamId,
        updatedAt: new Date(),
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

  // // Try multiple lookup strategies
  // let foundAccount = null;

  // // Try with ObjectId first
  // try {
  //   console.log(`[DEBUG] Trying with MongoDB ObjectId`);
  //   foundAccount = await collection.findOne({
  //     _id: new ObjectId(accountId),
  //   });
  //   console.log(
  //     `[DEBUG] ObjectId lookup result:`,
  //     foundAccount ? "Found" : "Not found"
  //   );
  // } catch (objIdError: any) {
  //   console.log(`[DEBUG] Error creating ObjectId:`, objIdError.message);
  //   // Continue to other lookup methods
  // }

  // // Try with string _id (in case it's stored as string) - this is what worked!
  // if (!foundAccount) {
  //   console.log(`[DEBUG] Trying with _id as string`);
  //   foundAccount = await collection.findOne({ _id: accountId as any });
  //   console.log(
  //     `[DEBUG] String _id lookup result:`,
  //     foundAccount ? "Found" : "Not found"
  //   );
  // }

  // if (!foundAccount) {
  //   console.log(`[DEBUG] All lookup attempts failed, account not found`);
  //   return res.status(404).json({ error: "Social account not found" });
  // }

  // console.log(`[DEBUG] Found account:`, foundAccount._id.toString());

  async handleLinkedInCallback(req: Request, res: Response) {
    try {
      if (req.query.error) {
        console.error("LinkedIn OAuth error:", req.query);
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=${
            req.query.error as any
          }`
        );
      }

      const code = req.query.code as string;

      if (!code) {
        console.error("No authorization code in LinkedIn callback");
        return res.redirect(
          `${process.env.FRONTEND_URL}/account-setup?error=no_code`
        );
      }

      if (!req.user) {
        console.error("No authenticated user in request");
        return res.status(401).json({
          error: "Authentication required",
          message: "No authenticated user in request",
        });
      }

      // Exchange the code for tokens
      const tokenData = await this.linkedInService.exchangeCodeForToken(code);

      // Get the user profile from LinkedIn
      const profile = await this.linkedInService.getUserProfile(
        tokenData.access_token
      );

      try {
        // Create the social account
        await this.linkedInService.createSocialAccount(
          req.user.uid,
          profile,
          tokenData.access_token,
          tokenData.refresh_token || null,
          req.user.organizationId,
          req.user.currentTeamId
        );

        // Redirect to the frontend settings page with success
        res.redirect(`${process.env.FRONTEND_URL}/account-setup?success=true`);
      } catch (error: any) {
        // Handle the case where the account is already connected
        if (error.code === "ACCOUNT_ALREADY_LINKED") {
          console.warn(
            "Attempted to connect already connected account:",
            error.metadata
          );

          // Encode error details for the frontend
          const errorDetails = encodeURIComponent(
            JSON.stringify({
              code: error.code,
              message: error.message,
              details: error.metadata,
            })
          );

          return res.redirect(
            `${process.env.FRONTEND_URL}/account-setup?error=account_already_connected&details=${errorDetails}`
          );
        }

        // Handle other errors
        console.error("Failed to create LinkedIn social account:", error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/account-setup?error=account_creation_failed&message=${encodeURIComponent(
            error.message || "Unknown error"
          )}`
        );
      }
    } catch (error: any) {
      console.error("Failed to handle LinkedIn callback:", error);
      res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=callback_failed&message=${encodeURIComponent(
          error.message || "Unknown error"
        )}`
      );
    }
  }

  // Getter methods to expose services
  getTwitterService(): TwitterService {
    return this.twitterService;
  }

  getSocialAccountService(): SocialAccountService {
    return this.socialAccountService;
  }

  getLinkedInService(): LinkedInService {
    return this.linkedInService;
  }
}
