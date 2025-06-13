import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";
import { getMediaTypeFromUrl } from "../../utils/cloudinary";

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

    // If we have a short-lived token, exchange it for a long-lived token
    if (response.data.access_token) {
      const longLivedToken = await exchangeForLongLivedToken(
        response.data.access_token
      );

      if (longLivedToken) {
        return longLivedToken;
      } else {
        return response.data.access_token;
      }
    }

    // Return the access token
    return response.data.access_token ?? null;
  } catch (error: any) {
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
      // Calculate token expiration date based on expires_in (in seconds)
      const expiresInSeconds = response.data.expires_in ?? 5184000; // Default to 60 days if not provided
      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + expiresInSeconds);

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
      `https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`
    );

    if (!response.data?.id) {
      throw new Error("Failed to fetch valid Threads user profile");
    }

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

    const { socialaccounts } = await getCollections();

    const accountId = profile.id;

    const anyExistingAccount = await socialaccounts.findOne({
      platform: "threads",
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
      platform: "threads",
      accountId,
      userId: new ObjectId(userId),
    });

    // Use the token expiration date from the long-lived token exchange if available
    // Otherwise default to 60 days from now
    const now = new Date();
    const tokenExpiresAt =
      lastTokenExpirationDate ??
      new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

    if (userExistingAccount) {
      // Treat this as a reconnection attempt — update token and metadata
      const updatedAccount = {
        accessToken,
        refreshToken,
        tokenExpiry: tokenExpiresAt,
        lastRefreshed: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...userExistingAccount.metadata,
          profileUrl: `https://threads.net/@${profile.username}`,
          followerCount: profile.public_metrics?.followers_count,
          followingCount: profile.public_metrics?.following_count,
          lastChecked: new Date(),
          profileImageUrl: profile.profile_picture_url,
          username: profile.username,
        },
        status: "active",
      };

      await socialaccounts.updateOne(
        { _id: userExistingAccount._id },
        { $set: updatedAccount }
      );

      return {
        _id: userExistingAccount._id,
        updated: true,
      };
    }

    // Create a new social account

    const newAccount = await socialaccounts.insertOne({
      userId: new ObjectId(userId),
      platform: "threads",
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
        profileImageUrl: profile.profile_picture_url,
      },
      permissions: {
        canPost: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    if (organizationId) {
      await socialaccounts.updateOne(
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

/**
 * Post content to Threads via Threads API
 * [https://developers.facebook.com/docs/threads/create-posts](https://developers.facebook.com/docs/threads/create-posts)
 */
export async function postToThreads({
  accountId,
  content,
  mediaUrls,
}: {
  accountId: string;
  content: string;
  mediaUrls?: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({
      // _id: new ObjectId(accountId),
      accountId,
    });

    if (!account) {
      return {
        success: false,
        error: `Social account not found: ${accountId}`,
      };
    }

    // Post the content based on the media type
    if (mediaUrls?.length && mediaUrls?.length > 1) {
      return await createThreadsCarouselPost({ account, content, mediaUrls });
    } else {
      return await createThreadsPost({ account, content, mediaUrls });
    }
  } catch (error: any) {
    // Handle OAuth/token errors
    if (error.response?.data?.error?.type === "OAuthException") {
      const errorCode = error.response?.data?.error?.code;
      const errorMessage =
        error.response?.data?.error?.message ?? "Unknown OAuth error";

      // Update account status directly in MongoDB
      try {
        const { socialaccounts } = await getCollections();
        await socialaccounts.updateOne(
          { _id: new ObjectId(accountId) },
          {
            $set: {
              status: "error",
              "metadata.lastError": errorMessage,
              "metadata.lastErrorTime": new Date(),
              "metadata.requiresReauth": errorCode === 190,
              updatedAt: new Date(),
            },
          }
        );
      } catch (updateError) {
        console.error(
          "Failed to update account status after OAuth error:",
          updateError
        );
      }

      if (errorCode === 190) {
        return {
          success: false,
          error:
            "Your Threads account token has expired. Please reconnect your account to continue posting.",
        };
      }

      return {
        success: false,
        error: `Authentication error with Threads: ${errorMessage}`,
      };
    }

    // Handle all other errors
    console.error("Error posting to Threads:", error);
    return {
      success: false,
      error: error.message ?? "Unknown error posting to Threads",
    };
  }
}

// --- Helper functions below (implement as in your codebase or import if already present) ---

async function createTextPost(
  account: any,
  content: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const containerResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads`,
      {
        text: content,
        media_type: "TEXT",
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!containerResponse?.data?.id) {
      throw new Error("Failed to create Threads media container");
    }

    const containerId = containerResponse.data.id;

    // Wait for the container to be processed (recommended by Meta)
    await delay(30000); // 30 seconds delay

    const publishResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads_publish`,
      {
        creation_id: containerId,
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!publishResponse?.data?.id) {
      throw new Error("Failed to publish Threads post");
    }

    return {
      success: true,
      id: publishResponse.data.id,
    };
  } catch (error: any) {
    console.error("Error creating text post on Threads:", error);
    return {
      success: false,
      error: error.message ?? "Unknown error creating text post on Threads",
    };
  }
}

async function createThreadsPost({
  account,
  content,
  mediaUrls,
}: {
  account: any;
  content: string;
  mediaUrls?: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const containerResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads`,
      {
        text: content,
        media_type: mediaUrls?.length
          ? getMediaTypeFromUrl(mediaUrls?.[0] ?? "") ?? "TEXT"
          : "TEXT",
        ...(mediaUrls?.length && getMediaTypeFromUrl(mediaUrls?.[0]) === "IMAGE"
          ? { image_url: mediaUrls?.[0] }
          : {}),
        ...(mediaUrls?.length && getMediaTypeFromUrl(mediaUrls?.[0]) === "VIDEO"
          ? { video_url: mediaUrls?.[0] }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!containerResponse?.data?.id) {
      return {
        success: false,
        error: "Failed to create Threads media container",
      };
    }

    const containerId = containerResponse.data.id;

    // Wait for the container to be processed (recommended by Meta)
    await delay(30000); // 30 seconds delay

    const publishResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads_publish`,
      {
        creation_id: containerId,
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!publishResponse?.data?.id) {
      return {
        success: false,
        error: "Failed to publish Threads post",
      };
    }

    return {
      success: true,
      id: publishResponse.data.id,
    };
  } catch (error: any) {
    console.error("Error creating text post on Threads:", error);
    return {
      success: false,
      error: error.message ?? "Unknown error creating text post on Threads",
    };
  }
}

async function createThreadsCarouselPost({
  account,
  content,
  mediaUrls,
}: {
  account: any;
  content: string;
  mediaUrls: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const containers = [];
    for (const mediaUrl of mediaUrls) {
      const itemContainer = await axios.post(
        `https://graph.threads.net/v1.0/${account.accountId}/threads`,
        {
          is_carousel_item: true,
          media_type: getMediaTypeFromUrl(mediaUrl),
          ...(getMediaTypeFromUrl(mediaUrl) === "IMAGE"
            ? { image_url: mediaUrl }
            : {}),
          ...(getMediaTypeFromUrl(mediaUrl) === "VIDEO"
            ? { video_url: mediaUrl }
            : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      containers.push(itemContainer.data.id);
    }

    const carouselResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads`,
      {
        text: content,
        media_type: "CAROUSEL",
        children: containers.join(","),
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const carouselId = carouselResponse.data.id;

    // Wait for the container to be processed (recommended by Meta)
    await delay(30000); // 30 seconds delay

    const publishResponse = await axios.post(
      `https://graph.threads.net/v1.0/${account.accountId}/threads_publish`,
      {
        creation_id: carouselId,
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: true,
      id: publishResponse.data.id,
    };
  } catch (error: any) {
    console.error("Error creating carousel post on Threads:", error);
    return {
      success: false,
      error: error.message ?? "Unknown error creating carousel post on Threads",
    };
  }
}

// Placeholder for image/video post helpers (implement as needed)
async function createImagePost(
  account: any,
  content: string,
  mediaUrl: string
) {
  // Implement Threads image post logic
  return { success: false, error: "Image posting not implemented yet" };
}

async function createVideoPost(
  account: any,
  content: string,
  mediaUrl: string
) {
  // Implement Threads video post logic
  return { success: false, error: "Video posting not implemented yet" };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a Threads account with a valid token
 */
export async function getAccountWithValidToken(
  accountId: string
): Promise<any> {
  try {
    const { socialaccounts } = await getCollections();

    const existingAccountForAnyUser = await socialaccounts.findOne({
      // platform: "threads",
      // _id: new ObjectId(accountId),
      accountId,
    });

    if (!existingAccountForAnyUser) {
      throw new Error(`Social account not found: ${accountId}`);
    }

    // Check if token refresh is needed
    const tokenExpiresAt =
      existingAccountForAnyUser.metadata?.tokenExpiresAt ?? null;

    const shouldRefresh =
      !tokenExpiresAt ||
      tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Less than 7 days remaining

    if (!shouldRefresh) {
      return existingAccountForAnyUser;
    }

    // Refresh the token
    await checkAndRefreshToken(accountId);

    // Get the updated account
    const updatedAccount = await socialaccounts.findOne({
      // platform: "threads",
      _id: new ObjectId(accountId),
    });
    if (!updatedAccount) {
      throw new Error(`Social account not found after refresh: ${accountId}`);
    }

    return updatedAccount;
  } catch (error) {
    console.error(`Error getting account with valid token`, error);
    throw error;
  }
}

/**
 * Check if token needs to be refreshed and refresh it if necessary
 */
export async function checkAndRefreshToken(
  accountId: string
): Promise<boolean> {
  try {
    const { socialaccounts } = await getCollections();
    const socialAccount = await socialaccounts.findOne({
      _id: new ObjectId(accountId),
    });

    if (!socialAccount) {
      throw new Error(`Social account not found: ${accountId}`);
    }

    // Check if token refresh is needed
    const tokenExpiresAt = socialAccount.metadata?.tokenExpiresAt
      ? new Date(socialAccount.metadata.tokenExpiresAt)
      : null;

    const now = new Date();
    const thirtyMinutesInMs = 30 * 60 * 1000;
    const shouldRefresh =
      !tokenExpiresAt ||
      tokenExpiresAt.getTime() - now.getTime() <= thirtyMinutesInMs;

    if (!shouldRefresh) {
      return true; // Token is still valid and not close to expiration
    }

    // For Threads, verify the token is still valid by making a simple API call
    try {
      const response = await axios.get(
        `https://graph.threads.net/v1.0/me?fields=id&access_token=${socialAccount.accessToken}`,
        {
          validateStatus: (status) => status < 500,
          timeout: 10000,
        }
      );

      // If we got a 401, the token is invalid/expired
      if (response.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }

      if (!response.data?.id) {
        throw new Error(
          "Failed to verify Threads token: No user ID in response"
        );
      }

      // Token is still valid, update the expiration date (Meta long-lived tokens typically last 60 days)
      const newExpiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now

      await socialaccounts.updateOne(
        { _id: new ObjectId(accountId) },
        {
          $set: {
            lastRefreshed: now,
            "metadata.tokenExpiresAt": newExpiresAt,
            "metadata.lastChecked": now,
            updatedAt: now,
          },
        }
      );

      return true;
    } catch (verifyError: any) {
      // If we get a 401 or other error during verification, handle it as a refresh error
      const isExpiredToken =
        verifyError.message === "TOKEN_EXPIRED" ||
        verifyError.response?.status === 401 ||
        (verifyError.response?.data?.error?.type === "OAuthException" &&
          verifyError.response?.data?.error?.code === 190);

      await socialaccounts.updateOne(
        { _id: new ObjectId(accountId) },
        {
          $set: {
            status: isExpiredToken ? "expired" : "error",
            "metadata.lastError":
              verifyError.response?.data?.error?.message ?? verifyError.message,
            "metadata.lastErrorTime": now,
            "metadata.requiresReauth": isExpiredToken,
            updatedAt: now,
          },
        }
      );

      if (isExpiredToken) {
        throw new Error("TOKEN_EXPIRED");
      } else {
        throw new Error(
          `Failed to verify token for Threads account: ${verifyError.message}`
        );
      }
    }
  } catch (error) {
    console.error(`Error checking token for account:`, error);
    throw error;
  }
}
