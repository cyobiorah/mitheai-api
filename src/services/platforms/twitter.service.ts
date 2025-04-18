import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

// These should be in your env/config
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID!;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI!;

export const getTwitterOAuthUrl = (redirectUri?: string) => {
  const state = uuidv4();
  const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(
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

export const publish = async (post: any, account: any) => {
  console.log("publis initiated");
};

export async function createSocialAccount(
  userId: string,
  profile: any,
  accessToken: string,
  refreshToken: string,
  organizationId?: string,
  teamId?: string
): Promise<any> {
  try {
    // Check if this account is connected to ANY user
    const { socialAccounts } = await getCollections();
    const anyExistingAccount = await socialAccounts.findOne({
      platform: "twitter",
      platformAccountId: profile.id,
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

    // Now check if this specific user has already connected this account
    const userExistingAccount = await socialAccounts.findOne({
      platform: "twitter",
      platformAccountId: profile.id,
      userId,
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

    // Build the social account object
    const socialAccount: any = {
      platform: "twitter",
      platformAccountId: profile.id,
      accountType: organizationId ? "business" : "personal", // or "business" if you determine from profile
      accountName: profile.username,
      accountId: profile.id,
      accessToken,
      refreshToken,
      tokenExpiry: null, // or set expiry if available
      lastRefreshed: new Date(),
      status: "active",
      userId: new ObjectId(userId),
      metadata: {
        profileUrl: `https://twitter.com/${profile.username}`,
        followerCount: profile.public_metrics?.followers_count,
        followingCount: profile.public_metrics?.following_count,
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

    if (organizationId) {
      socialAccount.organizationId = new ObjectId(organizationId);
    }
    if (teamId) {
      socialAccount.teamId = new ObjectId(teamId);
    }

    // Create the social account
    const createdAccount = await socialAccounts.insertOne(socialAccount);
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
