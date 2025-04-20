import * as crypto from "crypto";
import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

interface LinkedInProfile {
  sub: string;
  localizedFirstName?: string;
  localizedLastName?: string;
  profilePicture?: any;
  email?: string;
  name?: string;
}

interface LinkedInEmail {
  elements: Array<{ "handle~": { emailAddress: string } }>;
}

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const LINKEDIN_CALLBACK_URL = process.env.LINKEDIN_CALLBACK_URL!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

export class LinkedInError extends Error {
  constructor(
    public code: string,
    message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

export async function createSocialAccount(
  user: any,
  profile: LinkedInProfile,
  token: any
) {
  const { id: userId, organizationId } = user;
  const { access_token, id_token, expires_in } = token;
  const platform = "linkedin";
  const accountName = profile.name;
  const platformAccountId = profile.sub;
  const email = profile?.email ?? "";

  // Prevent duplicate connection
  const { socialaccounts } = await getCollections();
  const existing = await socialaccounts.findOne({
    platform,
    platformAccountId,
  });
  if (existing) {
    throw new Error(
      "This LinkedIn account is already connected to another user."
    );
  }

  // Construct metadata (customize as needed)
  const metadata = {
    profileUrl: `https://www.linkedin.com/in/${profile.sub}`,
    lastChecked: new Date(),
    // Add more LinkedIn-specific metadata as needed
  };

  // Construct permissions (customize as needed)
  const permissions = {
    canPost: true,
    canSchedule: true,
    canAnalyze: true,
  };

  // Ownership model: user, team, organization
  const socialAccount = await socialaccounts.insertOne({
    userId: new ObjectId(userId),
    platform,
    platformAccountId,
    accountType: organizationId ? "business" : "personal",
    accountName,
    username: accountName,
    accountId: profile.sub,
    email,
    accessToken: access_token,
    idToken: id_token,
    tokenExpiry: new Date(Date.now() + expires_in * 1000),
    lastRefreshed: new Date(),
    status: "active",
    profileData: profile,
    metadata,
    permissions,
    connectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (organizationId) {
    await socialaccounts.updateOne(
      { _id: socialAccount.insertedId },
      { $set: { organizationId: new ObjectId(organizationId) } }
    );
  }

  return socialAccount;
}

/**
 * Generate authorization URL for LinkedIn OAuth
 */
export async function getAuthorizationUrl(state?: string): Promise<string> {
  // Generate a random state value for CSRF protection if not provided
  state ??= crypto.randomBytes(16).toString("hex");

  // Define the scopes needed for LinkedIn
  const scopes = ["openid", "profile", "w_member_social", "email"];

  // Construct the authorization URL
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("client_id", LINKEDIN_CLIENT_ID);
  authUrl.searchParams.append("redirect_uri", LINKEDIN_CALLBACK_URL);
  authUrl.searchParams.append("state", state);
  authUrl.searchParams.append("scope", scopes.join(" "));

  return authUrl.toString();
}

export async function handleLinkedInCallback(req: any, res: any) {
  try {
    if (req.query.error) {
      console.error("LinkedIn OAuth error:", req.query);
      return res.redirect(
        `${FRONTEND_URL}/account-setup?error=${req.query.error}`
      );
    }

    const code = req.query.code as string;

    if (!code) {
      console.error("No authorization code in LinkedIn callback");
      return res.redirect(`${FRONTEND_URL}/account-setup?error=no_code`);
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

    // Get the user profile from LinkedIn
    const profile = await getUserProfile(tokenData.access_token);

    try {
      // Create the social account
      await createSocialAccount(req.user, profile, tokenData);

      // Redirect to the frontend settings page with success
      res.redirect(`${FRONTEND_URL}/account-setup?success=true`);
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
            details: error.metadata,
          })
        );

        return res.redirect(
          `${FRONTEND_URL}/account-setup?error=account_already_connected&details=${errorDetails}`
        );
      }

      // Handle other errors
      console.error("Failed to create LinkedIn social account:", error);
      return res.redirect(
        `${FRONTEND_URL}/account-setup?error=account_creation_failed&message=${encodeURIComponent(
          error.message ?? "Unknown error"
        )}`
      );
    }
  } catch (error: any) {
    console.error("Failed to handle LinkedIn callback:", error);
    res.redirect(
      `${FRONTEND_URL}/account-setup?error=callback_failed&message=${encodeURIComponent(
        error.message ?? "Unknown error"
      )}`
    );
  }
}

if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !LINKEDIN_CALLBACK_URL) {
  throw new Error("Missing LinkedIn environment variables");
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<any> {
  try {
    const response = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: LINKEDIN_CALLBACK_URL,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
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
      error.response?.data ?? error.message
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
export async function getUserProfile(accessToken: string): Promise<any> {
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
      error.response?.data ?? error.message
    );
    throw new LinkedInError(
      "PROFILE_FETCH_ERROR",
      "Failed to fetch LinkedIn profile",
      { originalError: error.response?.data }
    );
  }
}
