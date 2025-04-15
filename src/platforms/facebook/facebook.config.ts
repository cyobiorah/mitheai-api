import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { FacebookService } from "./facebook.service";

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
    facebookStateId?: string;
    codeVerifier?: string;
  }
}

const facebookService = new FacebookService();

if (!process.env.API_URL) {
  throw new Error("API_URL environment variable is required");
}

if (!process.env.FACEBOOK_CLIENT_ID) {
  throw new Error("FACEBOOK_CLIENT_ID environment variable is required");
}

if (!process.env.FACEBOOK_CLIENT_SECRET) {
  throw new Error("FACEBOOK_CLIENT_SECRET environment variable is required");
}

// Configure callback URL based on environment
const callbackUrl = `${process.env.API_URL}/api/social-accounts/facebook/callback`;

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Create the Facebook authentication strategy
const strategy = new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
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
      let userId = req.session?.user?.uid;
      let organizationId = req.session?.user?.organizationId;
      let currentTeamId = req.session?.user?.currentTeamId;

      // If no user ID in session, try to get from Redis using state ID
      if (!userId && req.session?.facebookStateId) {
        try {
          // Import Redis service
          const redisService = require("../services/redis.service").default;

          // Get state data from Redis
          const stateData = await redisService.get(
            `facebook:${req.session.facebookStateId}`
          );

          if (stateData) {
            userId = stateData.uid;
            organizationId = stateData.organizationId;
            currentTeamId = stateData.currentTeamId;

            // Clean up Redis state
            await redisService.delete(
              `facebook:${req.session.facebookStateId}`
            );
          }
        } catch (redisError) {
          console.error("Error retrieving state from Redis:", redisError);
        }
      }

      if (!userId) {
        console.error(
          "No user ID found in session or Redis for Facebook callback"
        );
        return done(new Error("No user ID found in session"));
      }

      try {
        // Create/update the social account
        const account = await facebookService.createSocialAccount(
          profile,
          accessToken,
          refreshToken ?? "", // Use empty string instead of undefined
          userId,
          organizationId,
          currentTeamId
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
