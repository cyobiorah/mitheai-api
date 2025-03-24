import axios from "axios";
import { firestore } from "firebase-admin";
import { SocialAccount } from "../models/social-account.model";
import { Timestamp } from "firebase-admin/firestore";

export class ThreadsService {
  private readonly db: firestore.Firestore;

  constructor() {
    this.db = firestore();
  }

  /**
   * Get user profile from Threads API
   * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
   */
  async getUserProfile(accessToken: string) {
    try {
      // Exchange short-lived token for a long-lived token
      const longLivedTokenResponse = await axios.get(
        `https://threads.net/oauth/access_token/refresh?grant_type=refresh_token&client_secret=${process.env.THREADS_APP_SECRET}&access_token=${accessToken}`
      );

      if (!longLivedTokenResponse.data?.access_token) {
        console.error(
          "Failed to exchange for long-lived token:",
          longLivedTokenResponse.data
        );
        throw new Error("Failed to exchange for long-lived Threads token");
      }

      const longLivedToken = longLivedTokenResponse.data.access_token;
      console.log("Exchanged for long-lived Threads token");

      // Use the long-lived token to fetch user profile information
      // For Threads API, we need to use the Threads Graph API
      const response = await axios.get(
        `https://graph.threads.net/me?fields=id,username,account_type&access_token=${longLivedToken}`
      );

      if (!response.data?.id) {
        console.error("Invalid user profile data:", response.data);
        throw new Error("Failed to fetch valid Threads user profile");
      }

      console.log("Fetched Threads user profile:", response.data);

      // Store both tokens in the result
      return {
        ...response.data,
        longLivedToken,
      };
    } catch (error: any) {
      console.error(
        "Error fetching Threads user profile:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Exchange authorization code for a Threads access token
   * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
   */
  async exchangeCodeForToken(code: string): Promise<string | null> {
    try {
      // Prepare the token exchange request for Threads
      const redirectUri =
        process.env.NODE_ENV === "production"
          ? `${process.env.API_URL}/api/social-accounts/threads/callback`
          : `${
              process.env.API_URL ??
              "https://mitheai-api-git-dev-cyobiorahs-projects.vercel.app"
            }/api/social-accounts/threads/callback`;

      const params = new URLSearchParams();
      params.append("client_id", process.env.THREADS_APP_ID ?? "");
      params.append("client_secret", process.env.THREADS_APP_SECRET ?? "");
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);

      // Make the token exchange request to Threads
      console.log("Exchanging code for Threads token with params:", {
        clientId: process.env.THREADS_APP_ID ?? "",
        hasClientSecret: !!(process.env.THREADS_APP_SECRET ?? ""),
        redirectUri,
      });

      const response = await axios.post(
        "https://threads.net/oauth/access_token",
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      console.log("Threads token exchange response:", {
        status: response.status,
        hasAccessToken: !!response.data.access_token,
      });

      // Return the access token
      return response.data.access_token || null;
    } catch (error: any) {
      console.error(
        "Error exchanging code for Threads token:",
        error.response?.data || error.message
      );
      return null;
    }
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

  /**
   * Create or update social account for Threads
   */
  async createSocialAccount(
    userId: string,
    profile: any,
    accessToken: string,
    refreshToken?: string,
    organizationId?: string,
    teamId?: string
  ) {
    try {
      if (!profile || !profile.id) {
        throw new Error("Invalid profile data");
      }

      console.log(
        `Checking for existing Threads account for user ${userId} with Threads ID ${profile.id}`
      );

      // Check if a Threads account with this ID already exists for ANY user
      const existingAccountForAnyUser = await this.findExistingSocialAccount(
        "threads",
        profile.id
      );

      // If account exists but belongs to another user, throw error
      if (
        existingAccountForAnyUser &&
        existingAccountForAnyUser.userId !== userId
      ) {
        console.warn(
          `Threads account ${profile.id} already linked to user ${existingAccountForAnyUser.userId}`
        );
        throw new SocialAccountError(
          "ACCOUNT_ALREADY_LINKED",
          "This Threads account is already connected to another user"
        );
      }

      // Check if the current user already has this account connected
      const existingAccount = await this.findExistingSocialAccount(
        "threads",
        profile.id,
        userId
      );

      if (existingAccount) {
        console.log(`Updating existing Threads account for user ${userId}`);

        // Update the tokens
        const accountRef = this.db
          .collection("social_accounts")
          .doc(existingAccount.id);
        await accountRef.update({
          accessToken: accessToken,
          refreshToken: refreshToken,
          lastUpdated: Timestamp.now(),
          metadata: {
            ...existingAccount.metadata,
            tokenExpiresAt: Timestamp.fromDate(
              new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
            ), // 60 days from now
            profile: profile,
          },
        });

        // Get the updated account
        const updatedAccountSnap = await accountRef.get();
        return {
          id: updatedAccountSnap.id,
          ...updatedAccountSnap.data(),
        } as SocialAccount;
      }

      // Create a new social account
      // Get organization ID from user if not provided
      if (!organizationId) {
        const userDoc = await this.db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
          throw new Error(`User not found: ${userId}`);
        }
        organizationId = userDoc.data()?.organizationId;
      }

      console.log(`Creating new Threads account for user ${userId}`);

      const socialAccountData = {
        userId,
        platform: "threads",
        platformAccountId: profile.id,
        accountId: profile.id,
        displayName: profile.username || "Threads User",
        username: profile.username || "",
        accessToken: accessToken,
        refreshToken,
        profilePictureUrl: "", // Threads API would need additional permissions for this
        organizationId,
        teamId,
        metadata: {
          tokenExpiresAt: Timestamp.fromDate(
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          ), // 60 days from now
          accountType: profile.account_type,
          profile: profile,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await this.db
        .collection("social_accounts")
        .add(socialAccountData);
      const newAccountSnap = await docRef.get();

      return {
        id: newAccountSnap.id,
        ...newAccountSnap.data(),
      } as SocialAccount;
    } catch (error) {
      console.error("Error creating Threads social account:", error);
      throw error;
    }
  }

  /**
   * Post content to Threads via Threads API
   * https://developers.facebook.com/docs/threads/create-posts
   */
  async postContent(accountId: string, content: string, mediaUrls?: string[]) {
    try {
      const socialAccountSnap = await this.db
        .collection("social_accounts")
        .doc(accountId)
        .get();

      if (!socialAccountSnap.exists) {
        throw new Error(`Social account not found: ${accountId}`);
      }

      const socialAccount = {
        id: socialAccountSnap.id,
        ...socialAccountSnap.data(),
      } as SocialAccount;

      // Ensure we have a valid access token
      if (!socialAccount.accessToken) {
        throw new Error("No access token available for this account");
      }

      // Refresh token if needed
      await this.refreshAccessTokenIfNeeded(accountId);

      // Get the updated account with refreshed token
      const updatedAccount = await this.db
        .collection("social_accounts")
        .doc(accountId)
        .get()
        .then((snap) => ({ id: snap.id, ...snap.data() } as SocialAccount));

      // According to Meta docs, we need to retrieve the user's Threads ID
      // First, get the Threads ID from the stored account
      const threadsId = updatedAccount.platformAccountId;

      if (!threadsId) {
        throw new Error("Threads ID not found for this account");
      }

      // For Threads API, following Meta's documentation:
      // https://developers.facebook.com/docs/threads/create-posts
      // We need to use the /v18.0/{threads-id}/threads endpoint

      // If there's media, we need to handle it differently
      if (mediaUrls && mediaUrls.length > 0) {
        // Not implementing media uploads in this version as it requires additional steps
        throw new Error(
          "Media uploads to Threads are not supported in this version"
        );
      } else {
        // Text-only post
        const response = await axios.post(
          `https://graph.threads.net/v18.0/${threadsId}/threads`,
          {
            text: content,
          },
          {
            headers: {
              Authorization: `Bearer ${updatedAccount.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.data || !response.data.id) {
          throw new Error("Failed to create Threads post");
        }

        return {
          id: response.data.id,
          platform: "threads",
          status: "published",
          url: `https://threads.net/t/${response.data.id}`,
          data: response.data,
        };
      }
    } catch (error: any) {
      console.error(
        "Error posting to Threads:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Helper method to check if token refresh is needed and refresh if necessary
   */
  private async refreshAccessTokenIfNeeded(
    accountId: string
  ): Promise<boolean> {
    const socialAccountSnap = await this.db
      .collection("social_accounts")
      .doc(accountId)
      .get();

    if (!socialAccountSnap.exists) {
      throw new Error(`Social account not found: ${accountId}`);
    }

    const socialAccount = {
      id: socialAccountSnap.id,
      ...socialAccountSnap.data(),
    } as SocialAccount;

    // Check if token refresh is needed
    const tokenExpiresAt = socialAccount.metadata?.tokenExpiresAt
      ? socialAccount.metadata.tokenExpiresAt.toDate()
      : null;

    const shouldRefresh =
      !tokenExpiresAt ||
      tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Less than 7 days remaining

    if (!shouldRefresh) {
      return false; // No refresh needed
    }

    // Refresh the token
    await this.refreshAccessToken(accountId);
    return true;
  }

  /**
   * Expose the Firestore instance for use in routes
   * This allows for permission checks and other database operations
   */
  getDb(): firestore.Firestore {
    return this.db;
  }

  /**
   * Refresh the access token for a Threads account
   * Threads API tokens are valid for 60 days and can be refreshed
   */
  async refreshAccessToken(accountId: string) {
    try {
      const socialAccountSnap = await this.db
        .collection("social_accounts")
        .doc(accountId)
        .get();

      if (!socialAccountSnap.exists) {
        throw new Error(`Social account not found: ${accountId}`);
      }

      const socialAccount = {
        id: socialAccountSnap.id,
        ...socialAccountSnap.data(),
      } as SocialAccount;

      // Check if token refresh is needed
      const tokenExpiresAt = socialAccount.metadata?.tokenExpiresAt
        ? socialAccount.metadata.tokenExpiresAt.toDate()
        : null;

      const shouldRefresh =
        !tokenExpiresAt ||
        tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Less than 7 days remaining

      if (!shouldRefresh) {
        console.log(`Token refresh not needed yet for account ${accountId}`);
        return socialAccount;
      }

      console.log(`Refreshing token for Threads account ${accountId}`);

      // Refresh the long-lived token
      const refreshResponse = await axios.get(
        `https://threads.net/oauth/access_token/refresh?grant_type=refresh_token&client_secret=${process.env.THREADS_APP_SECRET}&access_token=${socialAccount.accessToken}`
      );

      if (!refreshResponse.data || !refreshResponse.data.access_token) {
        throw new Error("Failed to refresh access token");
      }

      // Update the account with the new token
      const accountRef = this.db.collection("social_accounts").doc(accountId);
      await accountRef.update({
        accessToken: refreshResponse.data.access_token,
        lastUpdated: Timestamp.now(),
        metadata: {
          ...socialAccount.metadata,
          tokenExpiresAt: Timestamp.fromDate(
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
          ), // 60 days from now
        },
      });

      // Get the updated account
      const updatedAccountSnap = await accountRef.get();
      console.log(`Successfully refreshed token for account ${accountId}`);

      return {
        id: updatedAccountSnap.id,
        ...updatedAccountSnap.data(),
      } as SocialAccount;
    } catch (error) {
      console.error("Error refreshing Threads access token:", error);
      throw error;
    }
  }
}

/**
 * Custom error class for social account errors
 */
export class SocialAccountError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}
