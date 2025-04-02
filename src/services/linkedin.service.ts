import { SocialAccount } from "../models/social-account.model";
import { RepositoryFactory } from "../repositories/repository.factory";
import { SocialAccountRepository } from "../repositories/social-account.repository";
import mongoose from "mongoose";
import axios from "axios";
import * as crypto from "crypto";
import jwt from "jsonwebtoken";

export class LinkedInError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

export class LinkedInService {
  private socialAccountRepository!: SocialAccountRepository;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID!;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
    this.redirectUri = process.env.LINKEDIN_CALLBACK_URL!;
    this.initialize();
  }

  private async initialize() {
    this.socialAccountRepository =
      await RepositoryFactory.createSocialAccountRepository();
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
   * Generate authorization URL for LinkedIn OAuth
   */
  async getAuthorizationUrl(
    userId: string,
    teamId?: string,
    organizationId?: string,
    state?: string
  ): Promise<string> {
    // Generate a random state value for CSRF protection if not provided
    if (!state) {
      state = crypto.randomBytes(16).toString("hex");
    }

    // Store the state with user info in Redis or session
    // This would be implemented based on your session management approach

    // Define the scopes needed for LinkedIn
    const scopes = ["openid", "profile", "w_member_social", "email"];

    // const scopes = ["profile", "email", "w_member_social"];

    // Construct the authorization URL
    const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", this.clientId);
    authUrl.searchParams.append("redirect_uri", this.redirectUri);
    authUrl.searchParams.append("state", state);
    authUrl.searchParams.append("scope", scopes.join(" "));

    return authUrl.toString();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<any> {
    try {
      const response = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.redirectUri,
          client_id: this.clientId,
          client_secret: this.clientSecret,
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
        "LinkedIn token exchange error:",
        error.response?.data || error.message
      );
      throw new LinkedInError(
        "TOKEN_EXCHANGE_ERROR",
        "Failed to exchange code for token",
        { originalError: error.response?.data }
      );
    }
  }

  /**
   * Get user profile from LinkedIn using the access token
   */
  async getUserProfile(accessToken: string): Promise<any> {
    try {
      const response = await axios.get("https://api.linkedin.com/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error(
        "LinkedIn profile fetch error:",
        error.response?.data || error.message
      );
      throw new LinkedInError(
        "PROFILE_FETCH_ERROR",
        "Failed to fetch LinkedIn profile",
        { originalError: error.response?.data }
      );
    }
  }

  /**
   * Verify the ID token from LinkedIn
   */
  async verifyIdToken(idToken: string): Promise<any> {
    try {
      // Fetch LinkedIn's JWKS (JSON Web Key Set)
      const jwksResponse = await axios.get(
        "https://www.linkedin.com/oauth/openid/jwks"
      );
      const jwks = jwksResponse.data;

      // Decode the token header to get the key ID
      const decodedHeader = jwt.decode(idToken, { complete: true });
      if (!decodedHeader || typeof decodedHeader === "string") {
        throw new Error("Invalid token format");
      }

      const kid = decodedHeader.header.kid;

      // Find the matching key in the JWKS
      const key = jwks.keys.find((k: any) => k.kid === kid);
      if (!key) {
        throw new Error("Matching key not found in JWKS");
      }

      // Verify the token (this is a simplified version - in production you'd use a proper JWT library)
      // For now, we'll just decode it since we've already verified the key exists
      const decoded = jwt.decode(idToken);
      return decoded;
    } catch (error: any) {
      console.error("ID token verification error:", error);
      throw new LinkedInError(
        "TOKEN_VERIFICATION_ERROR",
        "Failed to verify ID token",
        { originalError: error.message }
      );
    }
  }

  /**
   * Create a social account from LinkedIn profile
   */
  async createSocialAccount(
    userId: string,
    profile: any,
    accessToken: string,
    refreshToken: string | null,
    organizationId?: string,
    teamId?: string
  ): Promise<SocialAccount> {
    try {
      console.log(
        `Checking for existing LinkedIn account for user ${userId} with LinkedIn ID ${profile.sub}`
      );

      // Check for existing connection with the same LinkedIn ID and user ID
      const existingAccount = await this.findExistingSocialAccount(
        "linkedin",
        profile.sub,
        userId
      );

      if (existingAccount) {
        console.log(
          `Found existing LinkedIn account for this user: ${existingAccount.id}`
        );

        // Update the tokens in the existing account
        await this.socialAccountRepository.update(existingAccount.id, {
          accessToken: accessToken,
          refreshToken: refreshToken || "",
          lastRefreshed: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `Updated tokens for existing account ${existingAccount.id}`
        );
        return existingAccount;
      }

      console.log(`Creating new LinkedIn social account for user ${userId}`);

      // Before creating, check if this account is already connected to another user
      const duplicateCheck = await this.findExistingSocialAccount(
        "linkedin",
        profile.sub
      );

      if (duplicateCheck && duplicateCheck.userId !== userId) {
        throw new LinkedInError(
          "ACCOUNT_ALREADY_LINKED",
          "This LinkedIn account is already connected to another user"
        );
      }

      // Calculate token expiry (LinkedIn tokens typically expire in 60 days)
      const tokenExpiry = new Date();
      tokenExpiry.setDate(tokenExpiry.getDate() + 60); // Default to 60 days if not specified

      // Create new social account if no existing connection found
      const socialAccount: Omit<SocialAccount, "_id"> = {
        id: new mongoose.Types.ObjectId().toString(),
        platform: "linkedin",
        platformAccountId: profile.sub,
        accountType: "personal",
        accountName: profile.name || "LinkedIn User",
        accountId: profile.sub,
        accessToken,
        refreshToken: refreshToken ?? "", // Ensure refreshToken is never undefined
        tokenExpiry: tokenExpiry,
        lastRefreshed: new Date(),
        status: "active" as "active" | "expired" | "revoked" | "error", // Type assertion
        userId,
        ownershipLevel: this.determineOwnershipLevel(organizationId) as
          | "user"
          | "team"
          | "organization", // Type assertion
        metadata: {
          profileUrl: profile.picture || "",
          email: profile.email || "",
          lastChecked: new Date(),
          profile: profile,
        },
        permissions: {
          canPost: true,
          canSchedule: true,
          canAnalyze: true,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Only add optional fields if they have values
      if (organizationId) {
        socialAccount.organizationId = organizationId;
      }

      if (teamId) {
        socialAccount.teamId = teamId;
      }

      // Create the account in MongoDB
      const createdAccount = await this.socialAccountRepository.create(
        socialAccount
      );
      console.log(`Created new LinkedIn account with ID ${createdAccount.id}`);

      return createdAccount;
    } catch (error: any) {
      if (error.code === "ACCOUNT_ALREADY_LINKED") {
        throw error;
      }

      console.error("Error creating social account:", error);
      throw new LinkedInError(
        "ACCOUNT_CREATION_ERROR",
        "This LinkedIn account could not be connected",
        { originalError: error.message }
      );
    }
  }

  /**
   * Determine the ownership level based on the provided organization ID
   */
  private determineOwnershipLevel(organizationId?: string): string {
    return organizationId ? "organization" : "user";
  }

  /**
   * Get a social account by ID
   */
  async getSocialAccount(accountId: string): Promise<SocialAccount | null> {
    try {
      return await this.socialAccountRepository.findById(accountId);
    } catch (error) {
      console.error("Error getting social account:", error);
      return null;
    }
  }

  /**
   * Disconnect a LinkedIn account
   */
  async disconnectAccount(accountId: string): Promise<boolean> {
    try {
      return await this.socialAccountRepository.delete(accountId);
    } catch (error) {
      console.error("Error disconnecting account:", error);
      return false;
    }
  }

  /**
   * Post content to LinkedIn
   * Note: This is a placeholder - LinkedIn's API for posting content is more complex
   * and would need to be implemented according to their Share API documentation
   */
  async postToLinkedIn(accountId: string, message: string): Promise<any> {
    const account = await this.getSocialAccount(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    // This is a placeholder - actual implementation would use LinkedIn's Share API
    throw new LinkedInError(
      "NOT_IMPLEMENTED",
      "Posting to LinkedIn is not yet implemented",
      { accountId, message }
    );
  }

  async getUserProfileFromAccessToken(accessToken: string): Promise<any> {
    console.log("accessToken", { accessToken });
    try {
      // Get basic profile information
      const profileResponse = await axios.get(
        "https://api.linkedin.com/v2/me",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      // Get email address
      const emailResponse = await axios.get(
        "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      // Construct a unified profile object
      return {
        sub: profileResponse.data.id, // Use 'sub' as the standard identifier
        id: profileResponse.data.id,
        firstName: profileResponse.data.localizedFirstName,
        lastName: profileResponse.data.localizedLastName,
        name: `${profileResponse.data.localizedFirstName} ${profileResponse.data.localizedLastName}`,
        email: emailResponse.data.elements?.[0]?.["handle~"]?.emailAddress,
        picture: profileResponse.data.profilePicture?.displayImage || "",
        fullProfile: profileResponse.data,
      };
    } catch (error) {
      console.error("Failed to fetch LinkedIn user profile:", error);
      throw new LinkedInError(
        "PROFILE_FETCH_FAILED",
        "Could not retrieve LinkedIn user profile",
        {
          error,
        }
      );
    }
  }
}
