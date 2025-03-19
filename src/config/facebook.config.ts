import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { FacebookService } from "../services/facebook.service";

declare module "express-session" {
  interface SessionData {
    user: {
      uid: string;
      email?: string;
      userType?: "individual" | "organization";
      organizationId?: string;
      teamIds?: string[];
      currentTeamId?: string;
      role?: "super_admin" | "org_owner" | "team_manager" | "user";
      isNewUser?: boolean;
      settings?: {
        permissions: string[];
        theme: "light" | "dark";
        notifications: any[];
      };
    };
    skipWelcome?: boolean;
  }
}

const facebookService = new FacebookService();

// Configure callback URL based on environment
const callbackUrl =
  process.env.NODE_ENV === "production"
    ? `${process.env.API_URL}/api/social-accounts/facebook/callback`
    : "http://localhost:3001/api/social-accounts/facebook/callback";

console.log("Facebook callback URL:", callbackUrl);

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Create the Facebook authentication strategy
const strategy = new FacebookStrategy(
  {
    clientID:
      process.env.FACEBOOK_CLIENT_ID ?? process.env.FACEBOOK_APP_ID ?? "",
    clientSecret:
      process.env.FACEBOOK_CLIENT_SECRET ??
      process.env.FACEBOOK_APP_SECRET ??
      "",
    callbackURL: callbackUrl,
    profileFields: ["id", "displayName", "name", "email", "photos"],
    scope: ["email", "public_profile"],
    passReqToCallback: true,
    enableProof: true, // Keep this for security
  },
  async (
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    profile: any,
    done: any
  ) => {
    try {
      console.log("Facebook OAuth callback received:", {
        accessToken: accessToken.substring(0, 10) + "...",
        refreshToken: refreshToken
          ? refreshToken.substring(0, 10) + "..."
          : "none",
        profile: {
          id: profile.id,
          displayName: profile.displayName,
          name: profile.name,
          emails: profile.emails,
        },
      });

      // Check for userId in session
      const userId = req.session?.user?.uid;
      if (!userId) {
        console.error("No user ID found in session for Facebook callback");
        return done(new Error("No user ID found in session"));
      }

      try {
        // Create/update the social account
        const account = await facebookService.createSocialAccount(
          userId,
          profile,
          accessToken,
          refreshToken ?? "", // Use empty string instead of undefined
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
            "Attempted to connect already connected account:",
            accountError.message
          );
          return done(accountError);
        }

        // Handle other errors
        console.error("Error creating/updating social account:", accountError);
        return done(accountError);
      }
    } catch (error) {
      console.error("OAuth callback error:", error);
      done(error);
    }
  }
);

passport.use("facebook", strategy);

export default passport;
