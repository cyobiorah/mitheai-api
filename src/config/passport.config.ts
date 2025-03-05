import passport from "passport";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { TwitterService } from "../services/twitter.service";
import session from "express-session";
import { firestore } from "firebase-admin";

type TokenCallback = (
  err: Error | { statusCode: number; data?: any } | undefined,
  accessToken?: string,
  refreshToken?: string,
  result?: any
) => void;

const twitterService = new TwitterService();

// Ensure consistent URL format
const callbackUrl = (
  process.env.TWITTER_CALLBACK_URL ||
  "http://localhost:3001/api/social-accounts/twitter/callback"
).replace(/:\d+/, ":3001"); // Force port 3001

// Log OAuth configuration
console.log("Twitter OAuth Config:", {
  clientId: process.env.TWITTER_CLIENT_ID,
  callbackUrl: callbackUrl,
});

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

const strategy = new OAuth2Strategy(
  {
    authorizationURL: "https://twitter.com/i/oauth2/authorize",
    tokenURL: "https://api.twitter.com/2/oauth2/token",
    clientID: process.env.TWITTER_CLIENT_ID!,
    clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    callbackURL: callbackUrl,
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    state: true,
    pkce: true,
    passReqToCallback: true,
    customHeaders: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
  },
  async (
    req: any,
    accessToken: string,
    refreshToken: string,
    params: any,
    profile: any,
    done: any
  ) => {
    try {
      console.log("OAuth callback received:", {
        accessToken: accessToken.substring(0, 10) + "...",
        refreshToken: refreshToken
          ? refreshToken.substring(0, 10) + "..."
          : "none",
        params,
        user: req.user,
      });

      // Get user profile from Twitter API v2
      const response = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=username,public_metrics",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "MitheAI/1.0",
          },
        }
      );

      const responseText = await response.text();
      console.log("Twitter API Response:", responseText);

      if (!response.ok) {
        console.error("Twitter API error:", responseText);
        return done(new Error("Failed to fetch user profile"));
      }

      const userData = JSON.parse(responseText);
      console.log("Twitter user data:", userData);

      if (!userData.data) {
        return done(new Error("No user data received"));
      }

      // Get user ID from session
      const userId = req.session?.user?.uid;
      if (!userId) {
        console.error("No user ID found in session");
        return done(new Error("No user ID found"));
      }

      // Create social account
      const account = await twitterService.createSocialAccount(
        userId,
        userData.data,
        accessToken,
        refreshToken
      );

      // Post a welcome tweet to verify the integration works
      try {
        console.log("Attempting to post welcome tweet...");
        await twitterService.postWelcomeTweet(account.id, userData.data.name);
        console.log("Welcome tweet posted successfully");
      } catch (tweetError) {
        // If welcome tweet fails, delete the account and report the error
        console.error("Failed to post welcome tweet:", tweetError);

        try {
          // Get a Firestore reference
          const db = firestore();

          // Delete the social account that was just created
          await db.collection("social_accounts").doc(account.id).delete();

          console.log(
            `Deleted social account ${account.id} due to welcome tweet failure`
          );

          // Return the error to halt the OAuth process
          return done(
            new Error(
              `Failed to post welcome tweet: ${
                tweetError instanceof Error
                  ? tweetError.message
                  : "Unknown error"
              }`
            )
          );
        } catch (deleteError) {
          console.error(
            "Error deleting social account after welcome tweet failure:",
            deleteError
          );
          return done(
            new Error("Twitter integration failed: Unable to post to Twitter")
          );
        }
      }

      return done(null, account);
    } catch (error) {
      console.error("OAuth callback error:", error);
      done(error as Error);
    }
  }
);

// Override the token exchange method
const getOAuthAccessToken = function (
  this: any,
  code: string,
  params: any | TokenCallback,
  callback?: TokenCallback
) {
  // Handle the case where params is actually the callback
  const tokenCallback = callback || (params as TokenCallback);
  const tokenParams = callback ? params : {};

  const finalParams = {
    ...tokenParams,
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  };

  const postData = Object.keys(finalParams)
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(finalParams[key])}`
    )
    .join("&");

  // Create Basic Auth header
  const basicAuth = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString("base64");

  this._request(
    "POST",
    this._getAccessTokenUrl(),
    {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
      "User-Agent": "MitheAI/1.0",
    },
    postData,
    null,
    (error: any, data: any, response: any) => {
      if (error) {
        console.error("Token exchange error:", error);
        const err = error.statusCode
          ? error
          : { statusCode: 500, data: error.message || error };
        return tokenCallback(err);
      }

      try {
        console.log("Token exchange response:", data);
        const results = JSON.parse(data);
        tokenCallback(
          undefined,
          results.access_token,
          results.refresh_token,
          results
        );
      } catch (e) {
        console.error("Token parse error:", e);
        tokenCallback({
          statusCode: 500,
          data: "Failed to parse access token response",
        });
      }
    }
  );
};

// Use type assertion to access protected property
(strategy as any)._oauth2.getOAuthAccessToken = getOAuthAccessToken;

passport.use("oauth2", strategy);

export default passport;
