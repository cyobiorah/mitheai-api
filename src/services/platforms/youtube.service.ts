import * as crypto from "crypto";
import { google } from "googleapis";
import axios from "axios";
import { ObjectId } from "mongodb";
import { getCollections } from "../../config/db";
import { Readable } from "stream";

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

export class YoutubeError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

export async function getAuthorizationUrl(state?: string): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI
  );

  // Define the scopes needed for YouTube
  //   const scopes = ["openid", "profile", "email", "youtube.readonly"];
  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/youtube.upload",
  ];

  // Generate a random state value for CSRF protection if not provided
  state ??= crypto.randomBytes(16).toString("hex");

  // Construct the authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    include_granted_scopes: true,
    state,
  });

  return authUrl.toString();
}

export async function handleYoutubeCallback(req: any, res: any) {
  try {
    if (req.query.error) {
      console.error("YouTube OAuth error:", req.query);
      return res.redirect(
        `${FRONTEND_URL}/dashboard/accounts?error=${req.query.error}`
      );
    }

    const code = req.query.code as string;

    if (!code) {
      console.error("No authorization code in YouTube callback");
      return res.redirect(`${FRONTEND_URL}/dashboard/accounts?error=no_code`);
    }

    if (!req.user) {
      console.error("No authenticated user in request");
      return res.status(401).json({
        error: "Authentication required",
        message: "No authenticated user in request",
      });
    }

    // Exchange the code for tokens
    const tokenData = await exchangeCodeForToken(code);

    // Get the user profile from YouTube
    const profile = await getUserProfile(tokenData.access_token);

    try {
      // Create the social account
      await createSocialAccount(req.user, profile, tokenData);

      // Redirect to the frontend settings page with success
      res.redirect(`${FRONTEND_URL}/dashboard/accounts?success=true`);
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
            metadata: error.metadata,
          })
        );

        // Redirect to the frontend with error details
        res.redirect(
          `${FRONTEND_URL}/dashboard/accounts?error=account_already_linked&details=${errorDetails}`
        );
      } else {
        console.error("Error connecting YouTube account:", error);
        res.redirect(`${FRONTEND_URL}/dashboard/accounts?error=unknown_error`);
      }
    }
  } catch (error: any) {
    console.error("YouTube callback error:", error);
    res.redirect(`${FRONTEND_URL}/dashboard/accounts?error=${error.message}`);
  }
}

export async function exchangeCodeForToken(code: string): Promise<any> {
  try {
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: YOUTUBE_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "YouTube token exchange error:",
      error.response?.data ?? error.message
    );
    throw new YoutubeError(
      "TOKEN_EXCHANGE_ERROR",
      "Failed to exchange code for token",
      { originalError: error.response?.data }
    );
  }
}

export async function getUserProfile(accessToken: string): Promise<any> {
  try {
    const response = await axios.get(
      "https://www.googleapis.com/oauth2/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error(
      "YouTube profile fetch error:",
      error.response?.data ?? error.message
    );
    throw new YoutubeError(
      "PROFILE_FETCH_ERROR",
      "Failed to fetch YouTube profile",
      { originalError: error.response?.data }
    );
  }
}

export async function createSocialAccount(user: any, profile: any, token: any) {
  const { userId, organizationId } = user;
  const { access_token, id_token, expires_in } = token;
  const platform = "youtube";
  const accountName = profile.name;
  const accountId = profile.id;

  const { socialaccounts } = await getCollections();

  const existing = await socialaccounts.findOne({
    platform,
    accountId,
  });
  if (existing) {
    const error: any = new Error(
      "This YouTube account is already connected to another user."
    );
    error.code = "ACCOUNT_ALREADY_LINKED";
    error.metadata = {
      existingAccountId: existing._id,
      userId: existing.userId,
      organizationId: existing.organizationId,
      connectedAt: existing.createdAt,
    };
    throw error;
  }

  const metadata = {
    profileUrl: `https://www.youtube.com/channel/${accountId}`,
    profileImageUrl: profile.picture,
    email: profile.email,
    verified: profile.verified_email,
    lastChecked: new Date(),
  };

  const permissions = {
    canPost: true,
    canSchedule: true,
    canAnalyze: true,
  };

  const insertResult = await socialaccounts.insertOne({
    platform,
    accountType: organizationId ? "business" : "personal",
    accountName,
    accountId,
    accessToken: access_token,
    refreshToken: token.refresh_token,
    idToken: id_token,
    tokenExpiry: new Date(Date.now() + expires_in * 1000),
    lastRefreshed: new Date(),
    status: "active",
    userId: new ObjectId(userId),
    metadata,
    permissions,
    connectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (organizationId) {
    await socialaccounts.updateOne(
      { _id: insertResult.insertedId },
      { $set: { organizationId: new ObjectId(organizationId) } }
    );
  }

  return insertResult;
}

export async function refreshAccessToken(accountId: string): Promise<any> {
  const account = await getSocialAccount(accountId);

  if (!account?.refreshToken) {
    throw new Error("Account not found or no refresh token");
  }

  try {
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const tokenData = response.data;

    if (!tokenData.access_token) {
      throw new YoutubeError(
        "MISSING_ACCESS_TOKEN",
        "No access token returned when refreshing",
        { response: tokenData }
      );
    }

    const updatedAccount = {
      ...account,
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token,
      tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
      lastRefreshed: new Date(),
      updatedAt: new Date(),
    };

    const { socialaccounts } = await getCollections();
    await socialaccounts.updateOne(
      { _id: new ObjectId(accountId) },
      { $set: updatedAccount }
    );

    return updatedAccount;
  } catch (error: any) {
    console.error(
      "YouTube refresh token error:",
      error.response?.data ?? error.message
    );
    throw new YoutubeError(
      "TOKEN_REFRESH_ERROR",
      "Failed to refresh access token",
      { originalError: error.response?.data }
    );
  }
}

export async function getSocialAccount(accountId: string): Promise<any> {
  const { socialaccounts } = await getCollections();
  try {
    return socialaccounts.findOne({ _id: new ObjectId(accountId) });
  } catch (error) {
    console.error(`Error retrieving social account :`, error);
    return null;
  }
}

export async function postToYouTube({
  postData,
  mediaFiles,
}: {
  postData: any;
  mediaFiles: Express.Multer.File[];
}): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const { accountId, content } = postData;

  const { socialaccounts, socialposts } = await getCollections();

  const account = await socialaccounts.findOne({
    accountId,
    platform: "youtube",
  });

  if (!account) {
    return { success: false, error: "YouTube account not found" };
  }

  if (!account.accessToken || new Date(account.tokenExpiry) < new Date()) {
    return {
      success: false,
      error: "YouTube access token has expired. Please reconnect your account.",
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const file = mediaFiles[0]; // YouTube only allows one video per upload

  try {
    const uploadRes = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: content?.slice(0, 100) ?? "Skedlii Upload",
          description: content ?? "",
        },
        status: {
          privacyStatus: "private", // or "public" / "unlisted"
        },
      },
      media: {
        body: Readable.from(file.buffer),
      },
    });

    const videoId = uploadRes.data.id;

    if (!videoId) {
      return {
        success: false,
        error: "Failed to upload video to YouTube",
      };
    }

    await socialposts.insertOne({
      userId: account.userId,
      organizationId: account.organizationId
        ? new ObjectId(account.organizationId)
        : undefined,
      socialAccountId: account._id,
      platform: "youtube",
      content,
      metadata: {
        videoId,
        accountName: account.accountName,
        profileImageUrl: account.metadata?.profileImageUrl,
      },
      mediaType: "VIDEO",
      postId: videoId,
      status: "published",
      publishedDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true, videoId };
  } catch (error: any) {
    console.error(
      "YouTube upload error:",
      error?.response?.data || error.message
    );

    return {
      success: false,
      error: `YouTube API error: ${
        error?.response?.data?.error?.message || error.message
      }`,
    };
  }
}
