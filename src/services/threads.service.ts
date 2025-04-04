import axios from "axios";
import { SocialAccount } from "../models/social-account.model";
import { RepositoryFactory } from "../repositories/repository.factory";
import { SocialAccountRepository } from "../repositories/social-account.repository";

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

        await this.socialAccountRepository.update(existingAccount.id, {
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
        id: userId ?? undefined,
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
    mediaUrls?: string[],
    mediaType: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL" = "TEXT"
  ) {
    try {
      const socialAccount = await this.socialAccountRepository.findById(
        accountId
      );

      if (!socialAccount) {
        throw new Error(`Social account not found: ${accountId}`);
      }

      // Ensure we have a valid access token
      if (!socialAccount.accessToken) {
        throw new Error("No access token available for this account");
      }

      // Refresh token if needed
      await this.checkAndRefreshToken(accountId);

      // Get the updated account with refreshed token
      const updatedAccount = await this.socialAccountRepository.findById(
        accountId
      );

      // According to Meta docs, we need to retrieve the user's Threads ID
      // First, get the Threads ID from the stored account
      const threadsId = updatedAccount?.platformAccountId;

      if (!threadsId) {
        throw new Error("Threads ID not found for this account");
      }

      // Handle different post types based on media
      if (mediaType === "TEXT" || !mediaUrls || mediaUrls.length === 0) {
        // Text-only post
        return await this.createTextPost(threadsId, content, updatedAccount.accessToken);
      } else if (mediaType === "IMAGE" && mediaUrls.length === 1) {
        // Single image post
        return await this.createImagePost(threadsId, content, mediaUrls[0], updatedAccount.accessToken);
      } else if (mediaType === "VIDEO" && mediaUrls.length === 1) {
        // Single video post
        return await this.createVideoPost(threadsId, content, mediaUrls[0], updatedAccount.accessToken);
      } else if (mediaType === "CAROUSEL" && mediaUrls.length > 1) {
        // Carousel post (multiple images/videos)
        return await this.createCarouselPost(threadsId, content, mediaUrls, updatedAccount.accessToken);
      } else {
        throw new Error("Invalid media configuration for Threads post");
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
   * Create a text-only post on Threads
   */
  private async createTextPost(threadsId: string, content: string, accessToken: string) {
    // Create a media container for text post
    const containerResponse = await axios.post(
      `https://graph.threads.net/v1.0/${threadsId}/threads`,
      {
        text: content,
        media_type: "TEXT"
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      `https://graph.threads.net/v1.0/${threadsId}/threads_publish`,
      {
        creation_id: containerId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!publishResponse?.data?.id) {
      throw new Error("Failed to publish Threads post");
    }

    return {
      id: publishResponse.data.id,
      platform: "threads",
      status: "published",
      url: `https://threads.net/t/${publishResponse.data.id}`,
      data: publishResponse.data,
    };
  }

  /**
   * Create an image post on Threads
   */
  private async createImagePost(threadsId: string, content: string, imageUrl: string, accessToken: string) {
    // Create a media container for image post
    const containerResponse = await axios.post(
      `https://graph.threads.net/v1.0/${threadsId}/threads`,
      {
        text: content,
        media_type: "IMAGE",
        image_url: imageUrl
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      `https://graph.threads.net/v1.0/${threadsId}/threads_publish`,
      {
        creation_id: containerId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!publishResponse?.data?.id) {
      throw new Error("Failed to publish Threads post");
    }

    return {
      id: publishResponse.data.id,
      platform: "threads",
      status: "published",
      url: `https://threads.net/t/${publishResponse.data.id}`,
      data: publishResponse.data,
    };
  }

  /**
   * Create a video post on Threads
   */
  private async createVideoPost(threadsId: string, content: string, videoUrl: string, accessToken: string) {
    // Create a media container for video post
    const containerResponse = await axios.post(
      `https://graph.threads.net/v1.0/${threadsId}/threads`,
      {
        text: content,
        media_type: "VIDEO",
        video_url: videoUrl
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      `https://graph.threads.net/v1.0/${threadsId}/threads_publish`,
      {
        creation_id: containerId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!publishResponse?.data?.id) {
      throw new Error("Failed to publish Threads post");
    }

    return {
      id: publishResponse.data.id,
      platform: "threads",
      status: "published",
      url: `https://threads.net/t/${publishResponse.data.id}`,
      data: publishResponse.data,
    };
  }

  /**
   * Create a carousel post on Threads (multiple images/videos)
   */
  private async createCarouselPost(threadsId: string, content: string, mediaUrls: string[], accessToken: string) {
    // Step 1: Create individual item containers for each media
    const mediaContainerIds = [];
    
    for (const mediaUrl of mediaUrls) {
      // Determine if it's an image or video based on file extension
      const isVideo = /\.(mp4|mov|avi|wmv)$/i.test(mediaUrl);
      
      const itemResponse = await axios.post(
        `https://graph.threads.net/v1.0/${threadsId}/threads`,
        {
          is_carousel_item: true,
          media_type: isVideo ? "VIDEO" : "IMAGE",
          ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl })
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
      `https://graph.threads.net/v1.0/${threadsId}/threads`,
      {
        media_type: "CAROUSEL",
        children: mediaContainerIds.join(","),
        text: content
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
      `https://graph.threads.net/v1.0/${threadsId}/threads_publish`,
      {
        creation_id: carouselContainerId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!publishResponse?.data?.id) {
      throw new Error("Failed to publish carousel post");
    }
    
    return {
      id: publishResponse.data.id,
      platform: "threads",
      status: "published",
      url: `https://threads.net/t/${publishResponse.data.id}`,
      data: publishResponse.data,
    };
  }

  /**
   * Helper method to add delay between API calls
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        ? socialAccount.metadata.tokenExpiresAt
        : null;

      const shouldRefresh =
        !tokenExpiresAt ||
        tokenExpiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // Less than 7 days remaining

      if (!shouldRefresh) {
        return false; // No refresh needed
      }

      // Since Threads doesn't support token refresh in the same way as other Meta platforms,
      // we'll just use the existing token and update the expiration date
      try {
        // For Threads, we'll just verify the token is still valid by making a simple API call
        const response = await axios.get(
          `https://graph.threads.net/me?fields=id&access_token=${socialAccount.accessToken}`
        );

        if (!response.data?.id) {
          throw new Error("Failed to verify Threads token");
        }

        // Token is still valid, update the expiration date
        const now = new Date();
        const tokenExpiresAt = new Date(
          now.getTime() + 60 * 24 * 60 * 60 * 1000
        ); // 60 days

        await this.socialAccountRepository.update(accountId, {
          lastRefreshed: now,
          metadata: {
            ...socialAccount.metadata,
            tokenExpiresAt,
            lastChecked: now,
          },
          updatedAt: now,
        });
        console.log(
          `Successfully refreshed token for Threads account ${accountId}`
        );
        return true;
      } catch (refreshError) {
        console.error(
          `Error refreshing token for Threads account ${accountId}:`,
          refreshError
        );

        // Mark the account as having a refresh error
        await this.socialAccountRepository.update(accountId, {
          status: "error",
          updatedAt: new Date(),
        });

        throw new Error(
          `Failed to refresh token for Threads account: ${
            (refreshError as Error).message
          }`
        );
      }
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
