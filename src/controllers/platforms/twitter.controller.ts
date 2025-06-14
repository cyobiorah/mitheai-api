import { ObjectId } from "mongodb";
import * as twitterService from "../../services/platforms/twitter.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";
import { Response as ExpressResponse } from "express";

const rawCallbackUrl: string = process.env.TWITTER_CALLBACK_URL ?? "";

if (!rawCallbackUrl) {
  throw new Error(
    "Missing Twitter callback URL for environment: " + process.env.NODE_ENV
  );
}

const callbackUrl =
  process.env.NODE_ENV === "development"
    ? rawCallbackUrl.replace(/:\d+/, ":3001")
    : rawCallbackUrl;

interface TwitterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface TwitterUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
    };
  };
}

export const startDirectTwitterOAuth = async (req: any, res: any) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const skipWelcome = req.query.skipWelcome === "true";

    // Generate PKCE code verifier (43-128 chars)
    const codeVerifier = crypto
      .randomBytes(64)
      .toString("base64url")
      .substring(0, 64);

    // Generate code challenge using SHA-256
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Generate a unique state ID
    const stateId = crypto.randomBytes(16).toString("hex");

    // Create state data object
    const stateData = {
      userId: req.user.id,
      email: req.user.email,
      organizationId: req.user.organizationId,
      currentTeamId: req.user.currentTeamId,
      skipWelcome,
      timestamp: Date.now(),
      codeVerifier,
    };

    // Store in Redis with 10 minute expiration
    await redisService.set(`oauth:${stateId}`, stateData, 600);

    // Build the authorization URL
    const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", process.env.TWITTER_CLIENT_ID!);
    authUrl.searchParams.append("redirect_uri", callbackUrl);
    authUrl.searchParams.append(
      "scope",
      "tweet.read tweet.write users.read offline.access"
    );
    authUrl.searchParams.append("state", stateId);
    authUrl.searchParams.append("code_challenge", codeChallenge);
    authUrl.searchParams.append("code_challenge_method", "S256");

    res.send(authUrl.toString());
  } catch (error) {
    console.error("Error in direct-auth:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const handleTwitterCallback = async (req: any, res: any) => {
  try {
    if (req.query.error) {
      console.error("Twitter OAuth error:", req.query.error);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          req.query.error_description ?? "Authentication failed"
        )}`
      );
    }

    // Check for authorization code and state
    const { code, state } = req.query;
    if (!code || !state) {
      console.error("Missing code or state parameter");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          "Missing required parameters"
        )}`
      );
    }

    // Retrieve state data from Redis
    const stateData = await redisService.get(`oauth:${state}`);

    if (!stateData) {
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          "Authentication session expired or invalid"
        )}`
      );
    }

    // Check for timestamp expiration (10 minute window)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`oauth:${state}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          "Authentication link expired"
        )}`
      );
    }

    // Extract data from state
    const { codeVerifier, userId, organizationId, currentTeamId } = stateData;

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(
      "https://api.twitter.com/2/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier,
        }).toString(),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText,
      });

      try {
        const errorData = JSON.parse(errorText);
        console.error("Token exchange error details:", errorData);
      } catch (e: any) {
        console.log({ e });
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`
        )}`
      );
    }

    const tokenData = (await tokenResponse.json()) as TwitterTokenResponse;

    // Get Twitter profile
    const profileResponse = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url,public_metrics",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "MitheAI/1.0",
        },
      }
    );

    if (!profileResponse.ok) {
      console.error("Failed to fetch user profile:", {
        status: profileResponse.status,
        statusText: profileResponse.statusText,
      });
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          "Failed to fetch Twitter profile"
        )}`
      );
    }

    const profileData = (await profileResponse.json()) as TwitterUserResponse;

    // Create or update the social account
    try {
      if (!twitterService) {
        throw new Error("Failed to get TwitterService instance");
      }

      await twitterService.createSocialAccount(
        userId,
        profileData.data,
        tokenData,
        organizationId,
        currentTeamId
      );

      // Clear the code verifier from session as it's no longer needed
      if (req.user) {
        req.user.codeVerifier = undefined;
        await new Promise<void>((resolve) => {
          req.user.save(() => resolve());
        });
      }

      // Redirect to settings page with success message
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?success=true&message=${encodeURIComponent(
          "Twitter account connected successfully"
        )}`
      );
    } catch (error: any) {
      console.error("Failed to create social account:", error);

      // Check for specific error types
      if (error.code === "account_already_connected") {
        // Redirect with specific error for duplicate accounts
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/dashboard/accounts?error=duplicate_account&message=${encodeURIComponent(
            error.message
          )}`
        );
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=true&message=${encodeURIComponent(
          `Failed to create social account: ${error.message}`
        )}`
      );
    }
  } catch (error: any) {
    console.error("Twitter callback error:", error);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=true&message=${encodeURIComponent(
        `Authentication error: ${error.message}`
      )}`
    );
  }
};

export const post = async (req: any, res: any) => {
  const twitterContentItem = {
    type: "social_post",
    content: req.body.data.content,
    metadata: {
      source: "webapp",
      language: "en",
      tags: req.body.tags ?? [],
      customFields: req.body.customFields ?? {},
      socialPost: {
        platform: "twitter",
        accountId: req.body.data.accountId,
        accountName: req.body.data.accountName,
        accountType: req.body.data.accountType,
        mediaType: req.body.data.mediaType,
        scheduledTime: req.body.data.scheduledTime,
      },
    },
    userId: new ObjectId(req.user.id),
    createdBy: new ObjectId(req.user.id),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(req.body.data.teamId && { teamId: new ObjectId(req.body.data.teamId) }),
    ...(req.body.data.organizationId && {
      organizationId: new ObjectId(req.body.data.organizationId),
    }),
  };

  try {
    const result = await twitterService.post(twitterContentItem);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const postToTwitter = async ({
  postData,
  res,
}: {
  postData: any;
  res?: ExpressResponse;
}) => {
  try {
    const {
      accountId,
      accountName,
      accountType,
      mediaType,
      scheduledTime,
      content,
      teamId,
      organizationId,
      userId,
      tags = [],
      customFields = {},
    } = postData;

    if (!accountId || !content || !userId) {
      const msg = "Missing required fields (accountId, content, or userId)";
      return (
        res?.status(400).json({ error: msg }) ?? { success: false, error: msg }
      );
    }

    const twitterContentItem = {
      type: "social_post",
      content,
      metadata: {
        source: "webapp",
        language: "en",
        tags,
        customFields,
        socialPost: {
          platform: "twitter",
          accountId,
          accountName,
          accountType,
          mediaType,
          scheduledTime,
        },
      },
      userId: new ObjectId(userId),
      createdBy: new ObjectId(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(teamId && { teamId: new ObjectId(teamId) }),
      ...(organizationId && { organizationId: new ObjectId(organizationId) }),
    };

    const result = await twitterService.post(twitterContentItem);

    return (
      res?.status(200).json({ status: "success", id: result.id }) ?? {
        success: true,
        id: result.id,
      }
    );
  } catch (error: any) {
    console.error("Twitter post error:", error);
    return (
      res?.status(500).json({ error: error.message }) ?? {
        success: false,
        error: error.message,
      }
    );
  }
};

export const refreshAccessToken = async (req: any, res: any) => {
  const { accountId } = req.params;
  try {
    const result = await twitterService.refreshAccessToken(accountId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error refreshing access token:", error);
    return res.status(500).json({ error: error.message });
  }
};
