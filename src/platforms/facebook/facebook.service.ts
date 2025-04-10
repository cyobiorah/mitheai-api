import { SocialAccount } from "../../socialAccount/socialAccount.model";
import { RepositoryFactory } from "../../repositories/repository.factory";
import { SocialAccountRepository } from "../../socialAccount/socialAccount.repository";
import mongoose from "mongoose";

export class SocialAccountError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

export class FacebookService {
  private socialAccountRepository!: SocialAccountRepository;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.socialAccountRepository =
      await RepositoryFactory.createSocialAccountRepository();
  }

  /**
   * Check if a social account with the given platform and platformAccountId already exists
   */
  private async findExistingSocialAccount(
    platform: string,
    platformAccountId: string,
    userId?: string
  ): Promise<SocialAccount | null> {
    try {
      let query: any = { platform, platformAccountId };

      if (userId) {
        query.userId = userId;
      }

      return await this.socialAccountRepository.findOne(query);
    } catch (error) {
      console.error("Error finding existing social account:", error);
      return null;
    }
  }

  async createSocialAccount(
    profile: any,
    accessToken: string,
    refreshToken: string | null,
    userId: string,
    organizationId?: string,
    teamId?: string
  ): Promise<SocialAccount> {
    try {
      console.log(
        `Checking for existing Facebook account for user ${userId} with Facebook ID ${profile.id}`
      );

      // Check for existing connection with the same Facebook ID and user ID
      const existingAccount = await this.findExistingSocialAccount(
        "facebook",
        profile.id,
        userId
      );

      if (existingAccount) {
        console.log(
          `Found existing Facebook account for this user: ${existingAccount._id}`
        );

        // Update the tokens in the existing account
        await this.socialAccountRepository.update(existingAccount._id, {
          accessToken: accessToken,
          refreshToken: refreshToken ?? "",
          lastRefreshed: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `Updated tokens for existing account ${existingAccount._id}`
        );
        return existingAccount;
      }

      console.log(`Creating new Facebook social account for user ${userId}`);

      // Before creating, check if this account is already connected to another user
      const duplicateCheck = await this.findExistingSocialAccount(
        "facebook",
        profile.id
      );

      if (duplicateCheck && duplicateCheck.userId !== userId) {
        throw new SocialAccountError(
          "ACCOUNT_ALREADY_LINKED",
          "This Facebook account is already connected to another user"
        );
      }

      // Create new social account if no existing connection found
      const socialAccount: SocialAccount = {
        _id: new mongoose.Types.ObjectId().toString(),
        platform: "facebook",
        platformAccountId: profile.id,
        accountType: "personal",
        accountName: profile.displayName || profile.name || "Facebook User",
        accountId: profile.id,
        accessToken,
        refreshToken: refreshToken ?? "", // Ensure refreshToken is never undefined
        tokenExpiry: null,
        lastRefreshed: new Date(),
        status: "active", // Type assertion for literal type
        userId,
        ownershipLevel: this.determineOwnershipLevel(organizationId) as
          | "user"
          | "team"
          | "organization", // Type assertion
        metadata: {
          profileUrl: `https://facebook.com/${profile.id}`,
          email: profile.emails?.[0]?.value ?? "",
          lastChecked: new Date(),
        },
        permissions: {
          canPost: true,
          canSchedule: true,
          canAnalyze: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Only add optional fields if they have values
      if (organizationId) {
        socialAccount.organizationId = organizationId;
      }

      if (teamId) {
        socialAccount.teamId = teamId;
      }

      // Create the account in MongoDB
      const createdAccount = await this.socialAccountRepository.create(
        socialAccount
      );
      console.log(`Created new Facebook account with ID ${createdAccount._id}`);

      return createdAccount;
    } catch (error: any) {
      if (
        error.code === "account_already_connected" ||
        error.code === "ACCOUNT_ALREADY_LINKED"
      ) {
        throw error;
      }

      console.error("Error creating social account:", error);
      throw new SocialAccountError(
        "ACCOUNT_ALREADY_LINKED",
        "This Facebook account could not be connected"
      );
    }
  }

  /**
   * Determine the ownership level based on the provided organization ID
   */
  private determineOwnershipLevel(organizationId?: string): string {
    return organizationId ? "organization" : "user";
  }

  async getSocialAccount(accountId: string): Promise<SocialAccount | null> {
    try {
      return await this.socialAccountRepository.findById(accountId);
    } catch (error) {
      console.error("Error getting social account:", error);
      return null;
    }
  }

  async disconnectAccount(accountId: string): Promise<boolean> {
    try {
      return await this.socialAccountRepository.delete(accountId);
    } catch (error) {
      console.error("Error disconnecting account:", error);
      return false;
    }
  }

  /**
   * Post to Facebook
   */
  async postToFacebook(accountId: string, message: string): Promise<any> {
    const account = await this.getSocialAccount(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v12.0/${account.platformAccountId}/feed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${account.accessToken}`,
          },
          body: JSON.stringify({
            message: message,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Facebook API error:", errorData);
        throw new Error(
          `Facebook API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error posting to Facebook:", error);
      throw error;
    }
  }
}
