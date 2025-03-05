import { firestore } from "firebase-admin";
import { SocialAccount } from "../models/social-account.model";
import { Client, auth } from "twitter-api-sdk";
import { ContentItem } from "../types";
import Twit from "twit";

export class TwitterService {
  private readonly db: firestore.Firestore;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID!;
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    this.db = firestore();
  }

  async createSocialAccount(
    userId: string,
    profile: any,
    accessToken: string,
    refreshToken: string,
    organizationId?: string,
    teamId?: string
  ): Promise<SocialAccount> {
    // Create doc reference first to get the ID
    const docRef = this.db.collection("social_accounts").doc();
    const docId = docRef.id;

    // Create base account object without optional fields
    const baseAccount: SocialAccount = {
      id: docId,
      platform: "twitter" as const,
      accountType: "personal" as const,
      accountName: profile.username,
      accountId: profile.id,
      accessToken,
      refreshToken,
      tokenExpiry: firestore.Timestamp.fromMillis(Date.now() + 7200000),
      lastRefreshed: firestore.Timestamp.now(),
      status: "active" as const,
      userId,
      metadata: {
        profileUrl: `https://twitter.com/${profile.username}`,
        followerCount: profile.public_metrics?.followers_count || 0,
        followingCount: profile.public_metrics?.following_count || 0,
        lastChecked: firestore.Timestamp.now(),
      },
      permissions: {
        canPost: true,
        canSchedule: true,
        canAnalyze: true,
      },
      createdAt: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    };

    // Add optional fields only if they are defined
    const socialAccount: SocialAccount = {
      ...baseAccount,
      ...(organizationId && { organizationId }),
      ...(teamId && { teamId }),
    };

    // Save to Firestore
    await docRef.set(socialAccount);

    return socialAccount;
  }

  /**
   * Post a welcome tweet when a user links their Twitter account
   * This is called automatically after account linking to verify the integration works
   */
  async postWelcomeTweet(accountId: string): Promise<any> {
    const welcomeMessage =
      "Just connected my account to MitheAI! 🚀 #ContentManagement #AITools";
    console.log(`Posting welcome tweet for account ${accountId}...`);

    // Let errors propagate instead of catching them
    const result = await this.postTweet(accountId, welcomeMessage);
    console.log("Welcome tweet posted successfully:", result);
    
    return result;
  }

  /**
   * Post a tweet
   * @param accountId The ID of the account to post the tweet on
   * @param message The message to post
   * @returns The posted tweet
   */
  async postTweet(accountId: string, message: string): Promise<any> {
    try {
      // Get account with valid token
      const account = await this.getValidAccount(accountId);

      console.log("Account data structure:", {
        platform: account.platform,
        accountType: account.accountType,
        tokenType: typeof account.accessToken,
        hasRefreshToken: !!account.refreshToken,
        tokenExpiry: account.tokenExpiry ? "exists" : "null",
      });

      // Check if we have OAuth 1.0a tokens (needed for v1.1 API)
      const hasOAuth1Tokens = account.accessToken && account.refreshToken;

      // Check if we have OAuth 2.0 token (needed for v2 API)
      const hasOAuth2Token =
        account.accessToken && account.accessToken.startsWith("");

      console.log("Token availability:", {
        hasOAuth1Tokens,
        hasOAuth2Token,
        clientIdConfigured: !!this.clientId,
        clientSecretConfigured: !!this.clientSecret,
      });

      // Try with v2 API first since it's the recommended approach
      try {
        console.log("Attempting to post tweet using v2 API...");
        const client = new Client(new auth.OAuth2Bearer(account.accessToken));

        const response = await client.tweets.createTweet({
          text: message,
        });

        console.log(
          "Successfully posted tweet using v2 API:",
          (response.data as any).id
        );
        return response;
      } catch (apiError: any) {
        // Handle specific API errors
        console.error("Twitter API v2 error details:", {
          status: apiError.status,
          statusText: apiError.statusText,
          error: apiError.error,
          message: apiError.message,
          stack: apiError.stack?.split("\n").slice(0, 3).join("\n"),
        });

        // If v2 fails and we have OAuth 1.0a tokens, try with v1.1 API
        if (hasOAuth1Tokens) {
          console.log("V2 API failed, attempting with v1.1 API...");
          try {
            const v1Response = await this.postTweetV1(account, message);
            return v1Response;
          } catch (v1Error: any) {
            console.error("V1.1 API error details:", {
              code: v1Error.code,
              statusCode: v1Error.statusCode,
              message: v1Error.message,
              allErrors: v1Error.allErrors,
              stack: v1Error.stack?.split("\n").slice(0, 3).join("\n"),
            });

            // Update account status to reflect permission issues
            await this.updateAccountPermissionStatus(accountId, apiError);

            // Throw a user-friendly error
            throw this.createUserFriendlyError(apiError);
          }
        } else {
          // Update account status to reflect permission issues
          await this.updateAccountPermissionStatus(accountId, apiError);

          // Throw a user-friendly error
          throw this.createUserFriendlyError(apiError);
        }
      }
    } catch (error) {
      // Check if this is a token error and try to refresh once
      if (
        error instanceof Error &&
        error.message.includes("token") &&
        error.message.includes("expired")
      ) {
        console.log("Token expired, attempting to refresh...");
        try {
          const refreshedAccount = await this.refreshAccessToken(accountId);

          // Try posting again with new token
          const client = new Client(
            new auth.OAuth2Bearer(refreshedAccount.accessToken)
          );

          try {
            const response = await client.tweets.createTweet({
              text: message,
            });

            return response;
          } catch (retryError) {
            console.error(
              "Failed to post tweet after token refresh:",
              retryError
            );
            throw retryError;
          }
        } catch (refreshError) {
          console.error("Failed to refresh token:", refreshError);
          throw refreshError;
        }
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Update account status when permission errors occur
   */
  private async updateAccountPermissionStatus(
    accountId: string,
    apiError: any
  ): Promise<void> {
    if (apiError.status === 403) {
      await this.db
        .collection("social_accounts")
        .doc(accountId)
        .update({
          status: "permission_denied",
          lastError: {
            message: apiError.error?.detail || "Permission denied by Twitter",
            timestamp: firestore.Timestamp.now(),
            code: 403,
          },
          "permissions.canPost": false,
          updatedAt: firestore.Timestamp.now(),
        });
    }
  }

  /**
   * Create a user-friendly error message based on the API error
   */
  private createUserFriendlyError(apiError: any): Error {
    // Permission error
    if (apiError.status === 403) {
      let errorDetail = "Your account doesn't have permission to post tweets.";

      // Check for specific error types based on error response
      if (apiError.error?.detail?.includes("not permitted")) {
        errorDetail =
          "Your Twitter app doesn't have the required permissions. " +
          "Make sure you have elevated access and 'tweet.write' scope enabled.";
      } else if (apiError.error?.detail?.includes("duplicate")) {
        errorDetail = "Cannot post duplicate content to Twitter.";
      }

      return new Error(`TwitterPermissionError: ${errorDetail}`);
    }

    // Rate limiting
    if (apiError.status === 429) {
      return new Error(
        `TwitterRateLimitError: Rate limit exceeded. Please try again later.`
      );
    }

    // Generic API error
    return new Error(
      `TwitterAPIError: ${apiError.status} ${apiError.statusText} - ${
        apiError.error?.detail || "Unknown error"
      }`
    );
  }

  /**
   * Debug method to test Twitter API connectivity
   * This will attempt to post using both v1 and v2 methods and log the results
   */
  async debugTwitterConnection(accountId: string): Promise<{
    v1Status: { success: boolean; details: any; error?: string };
    v2Status: { success: boolean; details: any; error?: string };
  }> {
    console.log(`[DEBUG] Testing Twitter API for account ${accountId}`);

    const account = await this.getValidAccount(accountId);
    const testMessage = `Testing MitheAI connection... ${new Date().toISOString()}`;

    // Result object
    const result = {
      v1Status: { success: false, details: {}, error: undefined },
      v2Status: { success: false, details: {}, error: undefined },
    };

    // Test V2 API
    try {
      console.log("[DEBUG] Testing Twitter V2 API...");
      const client = new Client(new auth.OAuth2Bearer(account.accessToken));

      const v2Response = await client.tweets.createTweet({
        text: testMessage + " [v2]",
      });

      result.v2Status.success = true;
      result.v2Status.details = v2Response.data || {};
      console.log("[DEBUG] V2 API test successful:", v2Response.data);
    } catch (error: any) {
      result.v2Status.success = false;
      result.v2Status.error = error.message || "Unknown error";
      result.v2Status.details = {
        status: error.status,
        statusText: error.statusText,
        errorDetail: error.error?.detail,
      };
      console.error("[DEBUG] V2 API test failed:", error);
    }

    // Test V1 API
    try {
      console.log("[DEBUG] Testing Twitter V1.1 API...");

      // For Twitter OAuth 1.0a, we need consumer keys and tokens
      if (
        !this.clientId ||
        !this.clientSecret ||
        !account.accessToken ||
        !account.refreshToken
      ) {
        throw new Error("Missing required OAuth 1.0a credentials");
      }

      const T = new Twit({
        consumer_key: this.clientId,
        consumer_secret: this.clientSecret,
        access_token: account.accessToken,
        access_token_secret: account.refreshToken,
        timeout_ms: 60 * 1000,
      });

      const v1Response = await T.post("statuses/update", {
        status: testMessage + " [v1]",
      });

      result.v1Status.success = true;
      result.v1Status.details = v1Response.data || {};
      console.log("[DEBUG] V1.1 API test successful:", v1Response.data);
    } catch (error: any) {
      result.v1Status.success = false;
      result.v1Status.error = error.message || "Unknown error";
      result.v1Status.details = {
        statusCode: error.statusCode,
        code: error.code,
        allErrors: error.allErrors,
      };
      console.error("[DEBUG] V1.1 API test failed:", error);
    }

    // Log overall result
    console.log("[DEBUG] Twitter API test results:", {
      v1Working: result.v1Status.success,
      v2Working: result.v2Status.success,
      recommendedAPI: result.v2Status.success
        ? "v2"
        : result.v1Status.success
        ? "v1"
        : "none",
    });

    return result;
  }

  /**
   * Post a tweet using Twitter API v1.1 as a fallback when v2 fails
   * This uses OAuth 1.0a authentication which requires consumer key/secret and access token/secret
   */
  private async postTweetV1(
    account: SocialAccount,
    message: string
  ): Promise<any> {
    try {
      // For Twitter OAuth 1.0a, we need:
      // - consumer_key (app's API key)
      // - consumer_secret (app's API secret key)
      // - access_token (user's access token)
      // - access_token_secret (user's access token secret, stored in refreshToken field)

      if (!this.clientId || !this.clientSecret) {
        throw new Error("Twitter API credentials not configured");
      }

      if (!account.accessToken || !account.refreshToken) {
        throw new Error("Account missing required OAuth 1.0a tokens");
      }

      console.log("Setting up Twit with OAuth 1.0a credentials");

      // Create a Twit instance with OAuth 1.0a credentials
      const T = new Twit({
        consumer_key: this.clientId,
        consumer_secret: this.clientSecret,
        access_token: account.accessToken,
        access_token_secret: account.refreshToken, // This is the access token secret for OAuth 1.0a
        timeout_ms: 60 * 1000, // 60 seconds timeout
      });

      console.log("Posting tweet using v1.1 API endpoint");

      // Post tweet using v1.1 endpoint
      const response = await T.post("statuses/update", { status: message });

      console.log(
        "Successfully posted tweet using v1.1 API:",
        (response.data as any).id_str
      );

      return {
        data: {
          id: (response.data as any).id_str,
          text: (response.data as any).text,
        },
      };
    } catch (error: any) {
      console.error("Error posting tweet with v1.1 API:", error);

      // Format error to match v2 API error structure
      throw new Error(
        `TwitterV1Error: ${error.statusCode || 500} - ${
          error.message || "Unknown error"
        }`
      );
    }
  }

  async scheduleTweet(
    accountId: string,
    message: string,
    scheduledTime: Date
  ): Promise<void> {
    const accountRef = this.db.collection("social_accounts").doc(accountId);
    const account = await accountRef.get();

    if (!account.exists) {
      throw new Error("Account not found");
    }

    // Store the scheduled tweet in Firestore
    await this.db.collection("scheduled_tweets").add({
      accountId,
      message,
      scheduledTime: firestore.Timestamp.fromDate(scheduledTime),
      status: "pending",
      createdAt: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    });
  }

  // This method would be called by a cron job or scheduler
  async processScheduledTweets(): Promise<void> {
    const now = firestore.Timestamp.now();

    const scheduledTweets = await this.db
      .collection("scheduled_tweets")
      .where("status", "==", "pending")
      .where("scheduledTime", "<=", now)
      .get();

    for (const tweet of scheduledTweets.docs) {
      const tweetData = tweet.data();
      try {
        await this.postTweet(tweetData.accountId, tweetData.message);
        await tweet.ref.update({
          status: "published",
          updatedAt: now,
        });
      } catch (error: any) {
        await tweet.ref.update({
          status: "failed",
          error: error.message,
          updatedAt: now,
        });
      }
    }
  }

  private async getSocialAccount(
    accountId: string
  ): Promise<SocialAccount | null> {
    const doc = await this.db
      .collection("social_accounts")
      .doc(accountId)
      .get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as SocialAccount;
  }

  async refreshAccessToken(accountId: string): Promise<SocialAccount> {
    const account = await this.getSocialAccount(accountId);
    if (!account || !account.refreshToken) {
      throw new Error("Account not found or no refresh token");
    }

    try {
      // Use the refresh token to get a new access token
      const response = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${this.clientId}:${this.clientSecret}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
        }).toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Token refresh failed:", errorData);
        throw new Error(
          `Failed to refresh token: ${response.status} ${response.statusText}`
        );
      }

      const data: any = await response.json();

      // Update the account with new tokens
      const updatedAccount = {
        ...account,
        accessToken: data.access_token,
        // If a new refresh token is provided, update it
        ...(data.refresh_token && { refreshToken: data.refresh_token }),
        // Set new expiry time (default to 2 hours if not specified)
        tokenExpiry: firestore.Timestamp.fromMillis(
          Date.now() + (data.expires_in || 7200) * 1000
        ),
        lastRefreshed: firestore.Timestamp.now(),
        updatedAt: firestore.Timestamp.now(),
      };

      // Update in Firestore
      await this.db
        .collection("social_accounts")
        .doc(accountId)
        .update(updatedAccount);

      return updatedAccount;
    } catch (error) {
      console.error("Error refreshing token:", error);

      // If we get specific errors that indicate the refresh token is invalid,
      // mark the account as requiring re-authentication
      if (
        error instanceof Error &&
        (error.message.includes("401") ||
          error.message.includes("invalid_grant"))
      ) {
        await this.db.collection("social_accounts").doc(accountId).update({
          status: "refresh_token_expired",
          updatedAt: firestore.Timestamp.now(),
        });
        throw new Error(
          "Refresh token expired, user needs to reconnect account"
        );
      }

      throw error;
    }
  }

  // Helper method to check if token is expired
  private isTokenExpired(account: SocialAccount): boolean {
    // If no expiry time is set, assume it's expired to be safe
    if (!account.tokenExpiry) return true;

    // Add a buffer of 5 minutes to refresh before actual expiry
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    const expiryTime = account.tokenExpiry.toMillis();

    return Date.now() > expiryTime - expiryBuffer;
  }

  // Get account and refresh token if needed
  private async getValidAccount(accountId: string): Promise<SocialAccount> {
    const account = await this.getSocialAccount(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    // Check if token is expired and refresh if needed
    if (this.isTokenExpired(account)) {
      console.log("Token expired, refreshing...");
      return await this.refreshAccessToken(accountId);
    }

    return account;
  }

  async getAuthUrl(): Promise<string> {
    console.log("Twitter OAuth Config:", {
      clientId: this.clientId,
      callbackUrl: process.env.TWITTER_CALLBACK_URL,
    });

    const callbackUrl = process.env.TWITTER_CALLBACK_URL!.replace("www.", "");
    const { verifier, challenge } = await this.generateCodeChallenge();

    // Store verifier for later use
    // TODO: Store this securely, perhaps in session or temporary storage
    console.log("Code verifier (save this):", verifier);

    // Make sure URL matches exactly what Twitter expects
    const authUrl =
      "https://twitter.com/i/oauth2/authorize?" +
      `client_id=${encodeURIComponent(this.clientId)}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `scope=${encodeURIComponent("tweet.read tweet.write users.read")}&` +
      "response_type=code&" +
      `code_challenge=${challenge}&` +
      "code_challenge_method=S256&" +
      `state=${Math.random().toString(36).substring(7)}`;

    console.log("Generated auth URL:", authUrl);
    console.log("Callback URL being used:", callbackUrl);
    return authUrl;
  }

  async post(content: ContentItem): Promise<{ id: string }> {
    if (
      !content.metadata.socialPost?.platform ||
      content.metadata.socialPost.platform !== "twitter"
    ) {
      throw new Error("Invalid platform for Twitter post");
    }

    // Get the social account for this user
    const accountSnapshot = await this.db
      .collection("social_accounts")
      .where("userId", "==", content.createdBy)
      .where("platform", "==", "twitter")
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (accountSnapshot.empty) {
      throw new Error("No active Twitter account found for user");
    }

    const accountData = accountSnapshot.docs[0].data() as SocialAccount;
    const accountId = accountSnapshot.docs[0].id;

    try {
      // Reuse the postTweet method which already handles token refresh
      const response = await this.postTweet(accountId, content.content);

      if (!response.data?.id) {
        throw new Error("Failed to create tweet");
      }

      return {
        id: response.data.id,
      };
    } catch (error) {
      // Let the error propagate to be handled by the controller
      throw error;
    }
  }

  private async generateCodeChallenge(): Promise<{
    verifier: string;
    challenge: string;
  }> {
    const verifier =
      Math.random().toString(36).substring(2) +
      Math.random().toString(36).substring(2);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return { verifier, challenge };
  }
}
