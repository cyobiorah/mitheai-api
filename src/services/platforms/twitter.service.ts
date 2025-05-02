import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";
import { Client, auth } from "twitter-api-sdk";
import { SocialAccount } from "../../schema/schema";

// These should be in your env/config
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI!;

export const getTwitterOAuthUrl = (redirectUri?: string) => {
  const state = uuidv4();
  const url = `[https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri ?? TWITTER_REDIRECT_URI
  )}&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
  return { url, state };
};

export const exchangeCodeForTokensAndProfile = async (code: string) => {
  // Exchange code for tokens
  const tokenRes = await axios.post(
    "https://api.twitter.com/2/oauth2/token",
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: "challenge", // PKCE: should be securely generated/stored per session
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const { access_token, refresh_token, expires_in } = tokenRes.data;

  // Fetch user profile
  const profileRes = await axios.get("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const profile = profileRes.data.data;

  return {
    platformAccountId: profile.id,
    accountType: "personal", // or "business" if you determine from profile
    accountName: profile.name,
    accountId: profile.username,
    accessToken: access_token,
    refreshToken: refresh_token,
    tokenExpiry: new Date(Date.now() + expires_in * 1000),
    metadata: profile,
  };
};

export async function createSocialAccount(
  userId: string,
  profile: any,
  tokenData: any,
  organizationId?: string,
  teamId?: string
): Promise<any> {
  try {
    const { socialaccounts } = await getCollections();

    const accountId = profile.id;

    const anyExistingAccount = await socialaccounts.findOne({
      platform: "twitter",
      accountId,
    });

    if (anyExistingAccount && anyExistingAccount.userId.toString() !== userId) {
      const error: any = new Error(
        "This social account is already connected to another user in the system"
      );
      error.code = "account_already_connected_to_other_user";
      error.details = {
        existingAccountId: anyExistingAccount._id,
        connectedUserId: anyExistingAccount.userId,
        organizationId: anyExistingAccount.organizationId,
        teamId: anyExistingAccount.teamId,
        connectionDate: anyExistingAccount.createdAt,
      };
      throw error;
    }

    const userExistingAccount = await socialaccounts.findOne({
      platform: "twitter",
      accountId,
      userId: new ObjectId(userId),
    });

    if (userExistingAccount) {
      const error: any = new Error("Account already connected by this user");
      error.code = "account_already_connected";
      error.details = {
        existingAccountId: userExistingAccount._id,
        connectedUserId: userExistingAccount.userId,
        organizationId: userExistingAccount.organizationId,
        teamId: userExistingAccount.teamId,
        connectionDate: userExistingAccount.createdAt,
      };
      throw error;
    }

    const socialAccount: SocialAccount = {
      platform: "twitter",
      accountType: organizationId ? "business" : "personal",
      accountName: profile.name,
      accountId: profile.id,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
      lastRefreshed: new Date(),
      status: "active",
      userId: new ObjectId(userId),
      metadata: {
        profileUrl: `https://twitter.com/${profile.username}`,
        followerCount: profile.public_metrics?.followers_count,
        followingCount: profile.public_metrics?.following_count,
        lastChecked: new Date(),
        profileImageUrl: profile.profile_image_url,
        username: profile.username,
      },
      permissions: {
        canPost: true,
        canSchedule: true,
        canAnalyze: true,
      },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (organizationId) {
      socialAccount.organizationId = new ObjectId(organizationId);
    }
    if (teamId) {
      socialAccount.teamId = new ObjectId(teamId);
    }

    const createdAccount = await socialaccounts.insertOne(socialAccount);
    return createdAccount;
  } catch (error: any) {
    if (
      error.code === "account_already_connected" ||
      error.code === "account_already_connected_to_other_user"
    ) {
      throw error;
    }
    console.error("Error creating social account:", error);
    throw new Error("Failed to create social account");
  }
}

export async function post(content: any): Promise<{ id: string }> {
  if (
    !content.metadata.socialPost?.platform ||
    content.metadata.socialPost.platform !== "twitter"
  ) {
    throw new Error("Invalid platform for Twitter post");
  }

  let account;
  const { socialaccounts } = await getCollections();

  // First try to find by accountId if it's in the metadata
  if (content.metadata.socialPost.accountId) {
    account = await socialaccounts.findOne({
      accountId: content.metadata.socialPost.accountId,
    });
  }

  if (!account) {
    throw new Error("No active Twitter account found");
  }

  const accountId = account._id.toString();

  try {
    // Reuse the postTweet method which already handles token refresh
    const response = await postTweet(accountId, content.content);

    if (!response.data?.id) {
      throw new Error("Failed to create tweet");
    }

    const { socialposts } = await getCollections();
    const postRecord = {
      ...content,
      platformPostId: response.data.id,
      platform: "twitter",
      status: "posted",
      postedAt: new Date(),
      metadata: {
        ...content.metadata,
        socialPost: {
          ...content.metadata.socialPost,
          username: account.metadata?.username,
          profileUrl: account.metadata?.profileUrl,
          profileImageUrl: account.metadata?.profileImageUrl,
        },
      },
    };

    await socialposts.insertOne(postRecord);

    return postRecord;
  } catch (error) {
    console.error("Error posting tweet:", error);
    throw error;
  }
}

export async function postTweet(
  accountId: string,
  message: string
): Promise<any> {
  try {
    const account = await getValidAccount(accountId);

    // Check for OAuth 2.0 token
    const hasOAuth2Token = !!(
      account.accessToken &&
      typeof account.accessToken === "string" &&
      account.accessToken.length > 0
    );

    if (!hasOAuth2Token) {
      throw new Error("No valid OAuth 2.0 token available for posting tweets");
    }

    try {
      const client = new Client(new auth.OAuth2Bearer(account.accessToken));
      const response = await client.tweets.createTweet({
        text: message,
      });
      return response;
    } catch (apiError: any) {
      // Handle duplicate content errors
      if (apiError.error && typeof apiError.error === "string") {
        const errorText = apiError.error.toLowerCase();
        if (
          errorText.includes("duplicate") ||
          errorText.includes("already tweeted")
        ) {
          throw new Error(
            `Twitter API error: duplicate content - ${apiError.error}`
          );
        }
      }

      // Check for error in response body
      if (apiError.response?.data) {
        const responseData = apiError.response.data;
        if (responseData.errors && Array.isArray(responseData.errors)) {
          const duplicateErrors = responseData.errors.filter(
            (err: any) =>
              err.message &&
              (err.message.toLowerCase().includes("duplicate") ||
                err.message.toLowerCase().includes("already tweeted"))
          );

          if (duplicateErrors.length > 0) {
            throw new Error(
              `Twitter API error: duplicate content - ${duplicateErrors[0].message}`
            );
          }
        }
      }
      throw apiError;
    }
  } catch (error) {
    console.error("Error posting tweet:", error);
    throw error;
  }
}

// Get account and refresh token if needed
export async function getValidAccount(accountId: string): Promise<any> {
  const account = await getSocialAccount(accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  if (isTokenExpired(account)) {
    return await refreshAccessToken(accountId);
  }

  return account;
}

export async function getSocialAccount(accountId: string): Promise<any> {
  const { socialaccounts } = await getCollections();
  try {
    return await socialaccounts.findOne({ _id: new ObjectId(accountId) });
  } catch (error) {
    console.error(`Error retrieving social account ${accountId}:`, error);
    return null;
  }
}

export async function refreshAccessToken(accountId: string): Promise<any> {
  const account = await getSocialAccount(accountId);
  if (!account?.refreshToken) {
    throw new Error("Account not found or no refresh token");
  }

  try {
    // Use the refresh token to get a new access token
    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Failed to refresh token: ${response.status} ${response.statusText} - ${errorData}`
      );
    }

    const data: any = await response.json();

    // Update the account with new tokens
    const updatedAccount = {
      ...account,
      accessToken: data.access_token,
      ...(data.refresh_token && { refreshToken: data.refresh_token }),
      tokenExpiry: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
      lastRefreshed: new Date(),
      updatedAt: new Date(),
    };

    const { socialaccounts } = await getCollections();
    await socialaccounts.updateOne(
      { _id: new ObjectId(accountId) },
      { $set: updatedAccount }
    );

    return updatedAccount;
  } catch (error) {
    // If refresh token is invalid, mark as error
    if (
      error instanceof Error &&
      (error.message.includes("401") || error.message.includes("invalid_grant"))
    ) {
      const { socialaccounts } = await getCollections();
      await socialaccounts.updateOne(
        { _id: new ObjectId(accountId) },
        {
          $set: {
            status: "error",
            updatedAt: new Date(),
          },
        }
      );
      throw new Error("Refresh token expired, user needs to reconnect account");
    }
    throw error;
  }
}

export function isTokenExpired(account: any): boolean {
  if (!account.tokenExpiry) return true;
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  const expiryTime =
    account.tokenExpiry instanceof Date
      ? account.tokenExpiry.getTime()
      : new Date(account.tokenExpiry).getTime();
  return Date.now() > expiryTime - expiryBuffer;
}
