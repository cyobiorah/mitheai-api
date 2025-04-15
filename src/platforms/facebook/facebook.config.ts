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
    enableProof: true,
  },
  async (
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    profile: any,
    done: any
  ) => {
    try {
      // --- Extract user/session info ---
      let userId = req.session?.user?.uid;
      let organizationId = req.session?.user?.organizationId;
      let currentTeamId = req.session?.user?.currentTeamId;

      // If no userId in session, try to get from Redis using stateId
      if (!userId && req.session?.facebookStateId) {
        try {
          const redisService = require("../services/redis.service").default;
          const stateData = await redisService.get(
            `facebook:${req.session.facebookStateId}`
          );
          if (stateData) {
            userId = stateData.uid;
            organizationId = stateData.organizationId;
            currentTeamId = stateData.currentTeamId;
            await redisService.delete(
              `facebook:${req.session.facebookStateId}`
            );
          }
        } catch (err) {
          console.error("Error retrieving state from Redis:", err);
        }
      }

      // --- STRONG VALIDATION: userId must be present ---
      if (!userId) {
        console.error(
          "No user ID found in session or Redis for Facebook callback"
        );
        return done(new Error("No user ID found in session"), null);
      }

      // --- Proceed to create the social account ---
      try {
        const account = await facebookService.createSocialAccount(
          profile,
          accessToken,
          refreshToken ?? "",
          userId,
          organizationId,
          currentTeamId
        );
        return done(null, account);
      } catch (accountError: any) {
        if (
          accountError.code === "ACCOUNT_ALREADY_LINKED" ||
          accountError.code === "account_already_connected"
        ) {
          return done(accountError);
        }
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
