import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { ThreadsService } from "./threads.service";

const threadsService = new ThreadsService();

// Configure callback URL based on environment
const callbackUrl = process.env.API_URL;

// Debug information
// console.log("Threads (via Instagram) OAuth configuration:", {
//   appId: process.env.THREADS_APP_ID,
//   callbackUrl,
//   hasSecret: !!(process.env.THREADS_APP_SECRET ?? ""),
// });

/*
 * According to Meta documentation:
 * https://developers.facebook.com/docs/threads/get-started
 * https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 *
 * Threads API is accessed through the Instagram Graph API
 * Authentication happens via Facebook Login or Instagram Basic Display API
 */
const strategy = new OAuth2Strategy(
  {
    // Use Threads OAuth endpoints
    authorizationURL: "https://threads.net/oauth/authorize",
    tokenURL: "https://threads.net/oauth/access_token",
    // Use Instagram app credentials if available, otherwise fall back to Facebook
    clientID: process.env.THREADS_APP_ID ?? "",
    clientSecret: process.env.THREADS_APP_SECRET ?? "",
    callbackURL: callbackUrl,
    passReqToCallback: true,
    // Required scopes for Threads API
    scope: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_read_replies",
      "threads_manage_insights",
    ],
    customHeaders: {
      "User-Agent": "MitheAI/1.0",
    },
    state: true,
  },
  async (
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    params: any,
    profile: any,
    done: any
  ) => {
    try {
      console.log("Instagram/Threads OAuth callback received:", {
        accessToken: accessToken.substring(0, 10) + "...",
        refreshToken: refreshToken
          ? refreshToken.substring(0, 10) + "..."
          : "none",
        params: params,
      });

      try {
        // Get user profile from Instagram Graph API (which includes Threads access)
        const userProfile = await threadsService.getUserProfile(accessToken);

        if (!userProfile?.id) {
          console.error(
            "Failed to fetch user profile from Instagram Graph API"
          );
          return done(new Error("Failed to fetch user profile"));
        }

        console.log("Instagram/Threads user profile:", {
          id: userProfile.id,
          username: userProfile.username,
        });

        // Check for userId in session
        const userId = req.session?.user?.uid;
        if (!userId) {
          console.error(
            "No user ID found in session for Instagram/Threads callback"
          );
          return done(new Error("No user ID found in session"));
        }

        // Create/update the social account
        const account = await threadsService.createSocialAccount(
          userId,
          userProfile,
          accessToken,
          refreshToken ?? "",
          req.session?.user?.organizationId,
          req.session?.user?.currentTeamId
        );

        // Return the account object to the callback
        return done(null, account);
      } catch (accountError: any) {
        // Handle the case where the account is already connected to another user
        if (
          accountError.code === "ACCOUNT_ALREADY_LINKED" ||
          accountError.code === "account_already_connected"
        ) {
          console.warn(
            "Attempted to connect already connected Instagram/Threads account:",
            accountError.message
          );
          return done(accountError);
        }

        // Handle other errors
        console.error(
          "Error creating/updating Instagram/Threads social account:",
          accountError
        );
        return done(accountError);
      }
    } catch (error) {
      console.error("OAuth callback error:", error);
      done(error);
    }
  }
);

// Export only the strategy, not the passport object
export default strategy;
