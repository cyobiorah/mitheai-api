import axios from "axios";
import { SocialAccount } from "../../socialAccount/socialAccount.model";
import { RepositoryFactory } from "../../repositories/repository.factory";
import { SocialAccountRepository } from "../../socialAccount/socialAccount.repository";

export class ThreadsService {
  private socialAccountRepository!: SocialAccountRepository;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.socialAccountRepository =
      await RepositoryFactory.createSocialAccountRepository();
  }

  /**
   * Get user profile from Threads API
   * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
   */
  async getUserProfile(accessToken: string) {
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

      // Return the access token
      return response.data.access_token || null;
    } catch (error: any) {
      console.error(
        "Error exchanging code for Threads token:",
        error.response?.data || error.message
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
      if (!profile?.id) {
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
        const now = new Date();
        const tokenExpiresAt = new Date(
          now.getTime() + 60 * 24 * 60 * 60 * 1000
        ); // 60 days

        await this.socialAccountRepository.update(existingAccount._id, {
          accessToken,
          refreshToken: refreshToken ?? undefined,
          status: "active",
          lastRefreshed: now,
          metadata: {
            ...existingAccount.metadata,
            tokenExpiresAt,
            lastChecked: now,
          },
          updatedAt: now,
        });

        return {
          ...existingAccount,
          accessToken,
          refreshToken: refreshToken ?? null,
        };
      }

      // Create a new social account
      console.log(`Creating new Threads account for user ${userId}`);

      const now = new Date();
      const tokenExpiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

      const newAccount = await this.socialAccountRepository.create({
        userId,
        organizationId: organizationId ?? undefined,
        teamId: teamId ?? undefined,
        platform: "threads",
        platformAccountId: profile.id,
        accountName: profile.username || "Threads User",
        accountId: profile.id,
        accountType: "personal", // Adding required accountType field
        accessToken,
        refreshToken: refreshToken ?? "",
        tokenExpiry: tokenExpiresAt,
        status: "active",
        lastRefreshed: now,
        ownershipLevel: userId ? "user" : teamId ? "team" : "organization",
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
   * https://developers.facebook.com/docs/threads/create-posts
   */
  async postContent(
    accountId: string,
    content: string,
    mediaType: "TEXT" | "IMAGE" | "VIDEO" = "TEXT",
    mediaUrl?: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      console.log(`Attempting to post to Threads with account ${accountId}`);

      try {
        // Get account with valid token (this will attempt to refresh if needed)
        const account = await this.getAccountWithValidToken(accountId);

        // Post the content based on the media type
        if (mediaType === "TEXT") {
          return await this.createTextPost(account, content);
        } else if (mediaType === "IMAGE" && mediaUrl) {
          return await this.createImagePost(account, content, mediaUrl);
        } else if (mediaType === "VIDEO" && mediaUrl) {
          return await this.createVideoPost(account, content, mediaUrl);
        } else {
          throw new Error(
            `Invalid media type or missing media URL: ${mediaType}`
          );
        }
      } catch (error: any) {
        // Check if this is a token expiration error
        if (
          error instanceof SocialAccountError &&
          error.code === "TOKEN_EXPIRED"
        ) {
          console.error(`Token expired for Threads account ${accountId}`);
          return {
            success: false,
            error:
              "Your Threads account token has expired. Please reconnect your account to continue posting.",
          };
        }

        // Check for other OAuth errors that might indicate token issues
        if (error.response?.data?.error?.type === "OAuthException") {
          const errorCode = error.response?.data?.error?.code;
          const errorMessage =
            error.response?.data?.error?.message || "Unknown OAuth error";

          console.error(
            `OAuth error posting to Threads: ${errorCode} - ${errorMessage}`
          );

          // Update account status to reflect the error
          await this.socialAccountRepository.update(accountId, {
            status: "error",
            metadata: {
              ...(
                await this.socialAccountRepository.findById(accountId)
              )?.metadata,
              lastError: errorMessage,
              lastErrorTime: new Date(),
              requiresReauth: errorCode === 190, // 190 is typically token expired
            },
            updatedAt: new Date(),
          });

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

        // Handle other errors
        console.error("Error posting to Threads:", error);
        return {
          success: false,
          error: error.message || "Unknown error posting to Threads",
        };
      }
    } catch (error: any) {
      console.error("Unexpected error in postContent:", error);
      return {
        success: false,
        error: "An unexpected error occurred while posting to Threads",
      };
    }
  }

  /**
   * Create a text-only post on Threads
   */
  private async createTextPost(
    account: SocialAccount,
    content: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      // Create a media container for text post
      const containerResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads`,
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
      await this.delay(30000); // 30 seconds delay

      // Publish the container
      const publishResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads_publish`,
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
        postId: publishResponse.data.id,
      };
    } catch (error: any) {
      console.error("Error creating text post on Threads:", error);
      return {
        success: false,
        error: error.message || "Unknown error creating text post on Threads",
      };
    }
  }

  /**
   * Create an image post on Threads
   */
  private async createImagePost(
    account: SocialAccount,
    content: string,
    imageUrl: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      // Create a media container for image post
      const containerResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads`,
        {
          text: content,
          media_type: "IMAGE",
          image_url: imageUrl,
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
      await this.delay(30000); // 30 seconds delay

      // Publish the container
      const publishResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads_publish`,
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
        postId: publishResponse.data.id,
      };
    } catch (error: any) {
      console.error("Error creating image post on Threads:", error);
      return {
        success: false,
        error: error.message || "Unknown error creating image post on Threads",
      };
    }
  }

  /**
   * Create a video post on Threads
   */
  private async createVideoPost(
    account: SocialAccount,
    content: string,
    videoUrl: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      // Create a media container for video post
      const containerResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads`,
        {
          text: content,
          media_type: "VIDEO",
          video_url: videoUrl,
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
      await this.delay(30000); // 30 seconds delay

      // Publish the container
      const publishResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads_publish`,
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
        postId: publishResponse.data.id,
      };
    } catch (error: any) {
      console.error("Error creating video post on Threads:", error);
      return {
        success: false,
        error: error.message || "Unknown error creating video post on Threads",
      };
    }
  }

  /**
   * Create a carousel post on Threads (multiple images/videos)
   */
  private async createCarouselPost(
    account: SocialAccount,
    content: string,
    mediaUrls: string[]
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      // Step 1: Create individual item containers for each media
      const mediaContainerIds = [];

      for (const mediaUrl of mediaUrls) {
        // Determine if it's an image or video based on file extension
        const isVideo = /\.(mp4|mov|avi|wmv)$/i.test(mediaUrl);

        const itemResponse = await axios.post(
          `https://graph.threads.net/v1.0/${account.platformAccountId}/threads`,
          {
            is_carousel_item: true,
            media_type: isVideo ? "VIDEO" : "IMAGE",
            ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }),
          },
          {
            headers: {
              Authorization: `Bearer ${account.accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!itemResponse?.data?.id) {
          throw new Error("Failed to create carousel item container");
        }

        mediaContainerIds.push(itemResponse.data.id);

        // Brief delay between item creation requests
        await this.delay(2000);
      }

      // Step 2: Create a carousel container
      const carouselResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads`,
        {
          media_type: "CAROUSEL",
          children: mediaContainerIds.join(","),
          text: content,
        },
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!carouselResponse?.data?.id) {
        throw new Error("Failed to create carousel container");
      }

      const carouselContainerId = carouselResponse.data.id;

      // Wait for the container to be processed (recommended by Meta)
      await this.delay(30000); // 30 seconds delay

      // Step 3: Publish the carousel container
      const publishResponse = await axios.post(
        `https://graph.threads.net/v1.0/${account.platformAccountId}/threads_publish`,
        {
          creation_id: carouselContainerId,
        },
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!publishResponse?.data?.id) {
        throw new Error("Failed to publish carousel post");
      }

      return {
        success: true,
        postId: publishResponse.data.id,
      };
    } catch (error: any) {
      console.error("Error creating carousel post on Threads:", error);
      return {
        success: false,
        error:
          error.message || "Unknown error creating carousel post on Threads",
      };
    }
  }

  /**
   * Helper method to add delay between API calls
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if token needs to be refreshed and refresh it if necessary
   */
  async checkAndRefreshToken(accountId: string): Promise<boolean> {
    try {
      const socialAccount = await this.socialAccountRepository.findById(
        accountId
      );

      if (!socialAccount) {
        throw new Error(`Social account not found: ${accountId}`);
      }

      // Check if token refresh is needed
      const tokenExpiresAt = socialAccount.metadata?.tokenExpiresAt
        ? new Date(socialAccount.metadata.tokenExpiresAt)
        : null;

      const now = new Date();
      const shouldRefresh =
        !tokenExpiresAt ||
        tokenExpiresAt.getTime() <= now.getTime(); // Token has expired

      if (!shouldRefresh) {
        console.log(`Token refresh not needed yet for account ${accountId}`);
        
        // Even if the token doesn't appear expired based on our stored date,
        // we should verify it's still valid with the API
        try {
          // For Threads, verify the token is still valid by making a simple API call
          const response = await axios.get(
            `https://graph.threads.net/me?fields=id&access_token=${socialAccount.accessToken}`,
            {
              validateStatus: function(status) {
                return status < 500; // Accept any status code below 500 to catch 401s
              }
            }
          );
          
          // If we got a 401, the token is invalid/expired
          if (response.status === 401) {
            throw new SocialAccountError(
              "TOKEN_EXPIRED",
              "Threads token has expired according to API response",
              { accountId }
            );
          }

          if (!response.data?.id) {
            throw new Error("Failed to verify Threads token");
          }
          
          // Token is still valid, update the expiration date to be safe
          const tokenExpiresAt = new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000
          ); // 30 days from now
          
          await this.socialAccountRepository.update(accountId, {
            lastRefreshed: now,
            metadata: {
              ...socialAccount.metadata,
              tokenExpiresAt,
              lastChecked: now,
            },
            updatedAt: now,
          });
          
          return true;
        } catch (verifyError: any) {
          // If we get a 401 or other error during verification, handle it as a refresh error
          console.error(
            `Error verifying token for Threads account ${accountId}:`,
            verifyError
          );
          
          // Check if the error is due to an expired token
          const isExpiredToken =
            verifyError.code === "TOKEN_EXPIRED" ||
            (verifyError.response?.status === 401) ||
            (verifyError.response?.data?.error?.type === "OAuthException" &&
            verifyError.response?.data?.error?.code === 190);
          
          // Mark the account as having a refresh error with appropriate status
          await this.socialAccountRepository.update(accountId, {
            status: isExpiredToken ? "expired" : "error",
            metadata: {
              ...socialAccount.metadata,
              lastError:
                verifyError.response?.data?.error?.message ||
                verifyError.message,
              lastErrorTime: new Date(),
              requiresReauth: isExpiredToken,
            },
            updatedAt: new Date(),
          });
          
          throw new SocialAccountError(
            isExpiredToken ? "TOKEN_EXPIRED" : "TOKEN_REFRESH_FAILED",
            isExpiredToken
              ? `Threads account token has expired and requires reconnection`
              : `Failed to verify token for Threads account: ${
                  (verifyError as Error).message
                }`,
            { accountId, platform: "threads" }
          );
        }
      }

      // Since Threads doesn't support token refresh in the same way as other Meta platforms,
      // we'll mark the token as expired and requiring reauthorization
      console.log(`Token has expired for Threads account ${accountId}, marking as expired`);
      
      await this.socialAccountRepository.update(accountId, {
        status: "expired",
        metadata: {
          ...socialAccount.metadata,
          lastError: "Token has expired based on stored expiration date",
          lastErrorTime: now,
          requiresReauth: true,
        },
        updatedAt: now,
      });
      
      throw new SocialAccountError(
        "TOKEN_EXPIRED",
        `Threads account token has expired and requires reconnection`,
        { accountId, platform: "threads" }
      );
    } catch (error) {
      console.error(`Error checking token for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Get a Threads account with a valid token
   */
  async getAccountWithValidToken(accountId: string): Promise<SocialAccount> {
    try {
      const socialAccount = await this.socialAccountRepository.findById(
        accountId
      );

      if (!socialAccount) {
        throw new Error(`Social account not found: ${accountId}`);
      }

      // Check if token refresh is needed
      const tokenExpiresAt = socialAccount.metadata?.tokenExpiresAt
        ? socialAccount.metadata.tokenExpiresAt
        : null;

      const shouldRefresh =
        !tokenExpiresAt ||
        tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Less than 7 days remaining

      if (!shouldRefresh) {
        console.log(`Token refresh not needed yet for account ${accountId}`);
        return socialAccount;
      }

      console.log(`Refreshing token for Threads account ${accountId}`);

      // Refresh the token
      await this.checkAndRefreshToken(accountId);

      // Get the updated account
      const updatedAccount = await this.socialAccountRepository.findById(
        accountId
      );
      if (!updatedAccount) {
        throw new Error(`Social account not found after refresh: ${accountId}`);
      }

      return updatedAccount;
    } catch (error) {
      console.error(
        `Error getting account with valid token ${accountId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Post a message to Threads
   */
  async postMessage(accountId: string, message: string): Promise<any> {
    try {
      // Get account with valid token
      const account = await this.getAccountWithValidToken(accountId);

      // Use the Threads API to post a message
      const response = await axios.post(
        "https://graph.threads.net/me/media",
        {
          caption: message,
          access_token: account.accessToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("Posted message to Threads:", response.data);
      return response.data;
    } catch (error: any) {
      console.error("Error posting to Threads:", error.response?.data || error);

      // Check for specific error types
      if (error.response?.status === 400) {
        // Handle invalid request errors
        throw new Error(
          `Invalid request to Threads API: ${
            error.response.data?.error?.message || "Unknown error"
          }`
        );
      } else if (error.response?.status === 401) {
        // Handle authentication errors
        await this.socialAccountRepository.update(accountId, {
          status: "error",
          updatedAt: new Date(),
        });
        throw new Error("Authentication failed with Threads API");
      } else {
        // Handle other errors
        throw new Error(
          `Error posting to Threads: ${
            error.response?.data?.error?.message || error.message
          }`
        );
      }
    }
  }

  /**
   * Get a user's Threads account
   */
  async getUserAccount(userId: string): Promise<SocialAccount | null> {
    try {
      const accounts = await this.socialAccountRepository.find({
        userId,
        platform: "threads",
        status: "active",
      });

      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error(`Error getting Threads account for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get a team's Threads account
   */
  async getTeamAccount(teamId: string): Promise<SocialAccount | null> {
    try {
      const accounts = await this.socialAccountRepository.find({
        teamId,
        platform: "threads",
        status: "active",
      });

      return accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error(`Error getting Threads account for team ${teamId}:`, error);
      return null;
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
