import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

let lastTokenExpirationDate: Date | null = null;

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

export function getAuthorizationUrl(state: string): string {
  const THREADS_CLIENT_ID = process.env.THREADS_CLIENT_ID!;
  const THREADS_CALLBACK_URL = process.env.THREADS_CALLBACK_URL!;
  const scopes = ["basic", "profile", "email"]; // Adjust as per Threads docs

  const authUrl = new URL("https://threads.net/oauth/authorize");
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("client_id", THREADS_CLIENT_ID);
  authUrl.searchParams.append("redirect_uri", THREADS_CALLBACK_URL);
  authUrl.searchParams.append("scope", scopes.join(" "));
  authUrl.searchParams.append("state", state);

  return authUrl.toString();
}

export async function handleOAuthCallback(stateData: any, code: string) {
  // Exchange code for access token
  // Fetch profile info
  // Save SocialAccount (with duplicate checking, ownership, etc.)
  // This is a placeholder; fill in with actual Threads API logic when available
}

/**
 * Exchange authorization code for a Threads access token
 * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 */
export async function exchangeCodeForToken(
  code: string
): Promise<string | null> {
  try {
    // Prepare the token exchange request for Threads
    const redirectUri =
      process.env.THREADS_CALLBACK_URL ??
      "http://localhost:3001/api/social-accounts/threads/callback";

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
      code: code.substring(0, 10) + "...", // Log partial code for debugging without exposing full code
    });

    // Use the Threads-specific endpoint as per the official documentation
    const response = await axios.post(
      "https://graph.threads.net/oauth/access_token",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // Add timeout to prevent hanging requests
        timeout: 10000,
        // Add validateStatus to get full error responses
        validateStatus: function (status) {
          return status < 500; // Resolve only if the status code is less than 500
        },
      }
    );

    console.log("Threads token exchange response:", {
      status: response.status,
      hasAccessToken: !!response.data.access_token,
      data: response.data,
    });

    // If we have a short-lived token, exchange it for a long-lived token
    if (response.data.access_token) {
      const longLivedToken = await exchangeForLongLivedToken(
        response.data.access_token
      );

      if (longLivedToken) {
        console.log("Successfully exchanged for long-lived Threads token");
        return longLivedToken;
      } else {
        console.warn(
          "Failed to get long-lived token, using short-lived token instead"
        );
        return response.data.access_token;
      }
    }

    // Return the access token
    return response.data.access_token ?? null;
  } catch (error: any) {
    console.error(
      "Error exchanging code for Threads token:",
      error.response?.data ?? error.message
    );

    // Log more detailed error information
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response headers:", error.response.headers);
      console.error("Response data:", error.response.data);
    }

    return null;
  }
}

/**
 * Exchange a short-lived token for a long-lived token (60 days)
 * https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<string | null> {
  try {
    console.log("Exchanging short-lived token for long-lived Threads token");

    // According to Meta documentation, we need to use th_exchange_token for Threads
    // https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
    const params = new URLSearchParams();
    params.append("grant_type", "th_exchange_token");
    params.append("client_secret", process.env.THREADS_APP_SECRET ?? "");
    params.append("access_token", shortLivedToken);

    const response = await axios.get("https://graph.threads.net/access_token", {
      params,
      timeout: 10000,
      validateStatus: function (status) {
        return status < 500;
      },
    });

    if (response.data.access_token) {
      console.log("Long-lived token exchange successful:", {
        hasToken: !!response.data.access_token,
        expiresIn: response.data.expires_in ?? "unknown",
        tokenType: response.data.token_type ?? "unknown",
      });

      // Calculate token expiration date based on expires_in (in seconds)
      const expiresInSeconds = response.data.expires_in ?? 5184000; // Default to 60 days if not provided
      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + expiresInSeconds);

      console.log(`Token will expire at: ${expirationDate.toISOString()}`);

      // Store the token expiration date for later use in checkAndRefreshToken
      lastTokenExpirationDate = expirationDate;

      return response.data.access_token;
    } else {
      console.error(
        "No access token in long-lived token exchange response:",
        response.data
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error exchanging for long-lived Threads token:",
      error.response?.data ?? error.message
    );

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }

    return null;
  }
}

/**
 * Get user profile from Threads API
 * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 */
export async function getUserProfile(accessToken: string) {
  try {
    // Use the access token directly to fetch user profile information
    // For Threads API, we need to use the Threads Graph API
    const response = await axios.get(
      `https://graph.threads.net/me?fields=id,username&access_token=${accessToken}`
    );

    if (!response.data?.id) {
      console.error("Invalid user profile data:", response.data);
      throw new Error("Failed to fetch valid Threads user profile");
    }

    console.log("Fetched Threads user profile:", response.data);

    // Store the token in the result
    return {
      ...response.data,
      longLivedToken: accessToken, // Use the original token
    };
  } catch (error: any) {
    console.error(
      "Error fetching Threads user profile:",
      error.response?.data ?? error.message
    );
    throw error;
  }
}

/**
 * Create or update social account for Threads
 */
export async function createSocialAccount(
  userId: string,
  profile: any,
  accessToken: string,
  refreshToken?: string,
  organizationId?: any,
  teamId?: string
) {
  try {
    if (!profile?.id) {
      throw new Error("Invalid profile data");
    }

    console.log(
      `Checking for existing Threads account for user ${userId} with Threads ID ${profile.id}`
    );

    const { socialAccounts } = await getCollections();
    const existingAccountForAnyUser = await socialAccounts.findOne({
      platform: "threads",
      platformAccountId: profile.id,
    });

    if (existingAccountForAnyUser) {
      console.warn(
        `Threads account ${profile.id} already linked to user ${existingAccountForAnyUser.userId}`
      );
      throw new SocialAccountError(
        "ACCOUNT_ALREADY_LINKED",
        "This Threads account is already connected to another user"
      );
    }

    // Use the token expiration date from the long-lived token exchange if available
    // Otherwise default to 60 days from now
    const now = new Date();
    const tokenExpiresAt =
      lastTokenExpirationDate ??
      new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

    // Create a new social account
    console.log(`Creating new Threads account for user ${userId}`);

    const newAccount = await socialAccounts.insertOne({
      userId: new ObjectId(userId),
      platform: "threads",
      platformAccountId: profile.id,
      accountName: profile.username,
      accountId: profile.id,
      accountType: organizationId ? "business" : "personal",
      accessToken,
      refreshToken: refreshToken ?? "",
      tokenExpiry: tokenExpiresAt,
      status: "active",
      lastRefreshed: now,
      metadata: {
        profile,
        tokenExpiresAt,
        lastChecked: now,
      },
      permissions: {
        canPost: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (organizationId) {
      await socialAccounts.updateOne(
        { _id: newAccount.insertedId },
        { $set: { organizationId: new ObjectId(organizationId) } }
      );
    }

    return newAccount;
  } catch (error) {
    if (error instanceof SocialAccountError) {
      throw error;
    }
    console.error("Error creating Threads social account:", error);
    throw new Error(
      `Failed to create Threads social account: ${(error as Error).message}`
    );
  }
}
