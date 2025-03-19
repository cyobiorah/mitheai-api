import { firestore } from "firebase-admin";
import { SocialAccount } from "../models/social-account.model";
import { Timestamp } from "firebase-admin/firestore";

export class FacebookService {
  private readonly db: firestore.Firestore;

  constructor() {
    this.db = firestore();
  }

  /**
   * Check if a social account with the given platform and platformAccountId already exists
   */
  private async findExistingSocialAccount(
    platform: string,
    platformAccountId: string,
    userId?: string
  ): Promise<SocialAccount | null> {
    let query = this.db
      .collection("social_accounts")
      .where("platform", "==", platform)
      .where("platformAccountId", "==", platformAccountId);

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as SocialAccount;
  }

  async createSocialAccount(
    userId: string,
    profile: any,
    accessToken: string,
    refreshToken: string,
    organizationId?: string,
    teamId?: string
  ): Promise<SocialAccount> {
    try {
      console.log(`Checking for existing Facebook account for user ${userId} with Facebook ID ${profile.id}`);
      
      // Check for existing connection with the same Facebook ID and user ID
      const existingAccount = await this.findExistingSocialAccount(
        "facebook",
        profile.id,
        userId
      );

      if (existingAccount) {
        console.log(`Found existing Facebook account for this user: ${existingAccount.id}`);
        
        // Update the tokens in the existing account
        await this.db.collection("social_accounts").doc(existingAccount.id).update({
          accessToken: accessToken,
          refreshToken: refreshToken || "",
          lastRefreshed: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
        
        console.log(`Updated tokens for existing account ${existingAccount.id}`);
        return existingAccount;
      }

      // Check for any existing account with this Facebook ID (from any user)
      const anyExistingAccount = await this.findExistingSocialAccount(
        "facebook",
        profile.id
      );

      if (anyExistingAccount && anyExistingAccount.userId !== userId) {
        console.error(
          `Facebook account ${profile.id} already connected to user ${anyExistingAccount.userId}, cannot connect to ${userId}`
        );
        throw new SocialAccountError(
          "ACCOUNT_ALREADY_LINKED",
          "This Facebook account is already connected to another user"
        );
      }

      console.log(`Creating new Facebook social account for user ${userId}`);
      
      // Create new social account if no existing connection found
      const socialAccount: SocialAccount = {
        id: this.db.collection("social_accounts").doc().id,
        platform: "facebook",
        platformAccountId: profile.id,
        accountType: "personal",
        accountName:
          profile.displayName ?? profile.name?.givenName ?? "Unknown",
        accountId: profile.id,
        accessToken,
        refreshToken: refreshToken || "", // Ensure refreshToken is never undefined
        tokenExpiry: null,
        lastRefreshed: Timestamp.now(),
        status: "active",
        userId,
        ownershipLevel: this.determineOwnershipLevel(organizationId),
        metadata: {
          profileUrl: `https://facebook.com/${profile.id}`,
          email: profile.emails?.[0]?.value ?? "",
          lastChecked: Timestamp.now(),
        },
        permissions: {
          canPost: true,
          canSchedule: true,
          canAnalyze: true,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // Only add optional fields if they have values
      if (organizationId) {
        socialAccount.organizationId = organizationId;
      }

      if (teamId) {
        socialAccount.teamId = teamId;
      }

      // Create with transaction to ensure atomicity
      await this.db.runTransaction(async (transaction) => {
        // Double-check no duplicate was created while we were processing - much more thorough check
        const userDuplicateCheck = await transaction.get(
          this.db
            .collection("social_accounts")
            .where("platform", "==", "facebook")
            .where("platformAccountId", "==", profile.id)
            .where("userId", "==", userId)
        );
        
        // If we already have this account for this user, don't create another one
        if (!userDuplicateCheck.empty) {
          console.log(`Transaction found existing account for this user, skipping creation`);
          throw new Error("SKIP_CREATION_EXISTING_FOUND");
        }
        
        // Check if any other user has this account
        const otherUserCheck = await transaction.get(
          this.db
            .collection("social_accounts")
            .where("platform", "==", "facebook")
            .where("platformAccountId", "==", profile.id)
        );
        
        if (!otherUserCheck.empty) {
          for (const doc of otherUserCheck.docs) {
            const existingData = doc.data();
            if (existingData.userId !== userId) {
              console.error(`Transaction found account connected to user ${existingData.userId}`);
              throw new SocialAccountError(
                "ACCOUNT_ALREADY_LINKED", 
                "This Facebook account is already connected to another user"
              );
            }
          }
        }

        // If we get here, we're clear to create the account
        console.log(`Creating new Facebook account with ID ${socialAccount.id}`);
        transaction.set(
          this.db.collection("social_accounts").doc(socialAccount.id),
          socialAccount
        );
      }).catch(error => {
        // If we're skipping creation because we found an existing account, this isn't a real error
        if (error.message === "SKIP_CREATION_EXISTING_FOUND") {
          console.log("Skipped creating duplicate account");
          // Find and return the existing account
          return this.findExistingSocialAccount("facebook", profile.id, userId);
        }
        throw error;
      });

      return socialAccount;
    } catch (error: any) {
      if (error.code === "account_already_connected" || error.code === "ACCOUNT_ALREADY_LINKED") {
        throw error;
      }
      
      // If this is our special case for found duplicates, don't treat as an error
      if (error.message === "SKIP_CREATION_EXISTING_FOUND") {
        console.log("Found existing account during transaction, returning that instead");
        const existingAccount = await this.findExistingSocialAccount("facebook", profile.id, userId);
        if (existingAccount) return existingAccount;
      }
      
      console.error("Error creating social account:", error);
      throw new SocialAccountError(
        "ACCOUNT_ALREADY_LINKED",
        "This Facebook account is already connected to another user"
      );
    }
  }

  private determineOwnershipLevel(
    organizationId?: string
  ): "user" | "organization" {
    if (organizationId) {
      return "organization";
    }
    return "user";
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

  async getSocialAccount(accountId: string): Promise<SocialAccount | null> {
    const doc = await this.db
      .collection("social_accounts")
      .doc(accountId)
      .get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as SocialAccount;
  }
}

export class SocialAccountError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}
