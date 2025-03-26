import passport from "passport";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { TwitterService } from "../services/twitter.service";
import { firestore } from "firebase-admin";
import "./facebook.config";
import threadsStrategy from "./threads.config";

type TokenCallback = (
  err: Error | { statusCode: number; data?: any } | undefined,
  accessToken?: string,
  refreshToken?: string,
  result?: any
) => void;

const twitterService = new TwitterService();

// Ensure consistent URL format for both local and Vercel environments
const callbackUrl = (
  process.env.TWITTER_CALLBACK_URL ??
  (process.env.NODE_ENV === "production" 
    ? "https://mitheai-api-git-kitchen-cyobiorahs-projects.vercel.app/api/social-accounts/twitter/callback"
    : "http://localhost:3001/api/social-accounts/twitter/callback")
).replace(/:\d+/, ":3001"); // Force port 3001 for local

// Log OAuth configuration
console.log("Twitter OAuth Config:", {
  clientId: process.env.TWITTER_CLIENT_ID,
  callbackUrl: callbackUrl,
  environment: process.env.NODE_ENV ?? "development"
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
        session: req.session,
        query: req.query,
        state: req.query.state || req._twitterState,
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

      // Get user ID from session or state parameter
      let userId = req.session?.user?.uid;
      console.log("User ID from session:", userId);
      
      // For serverless: try to get user ID from state parameter if session is missing
      const stateParam = req.query.state || req._twitterState;
      if (!userId && stateParam) {
        try {
          console.log("Attempting to parse state:", stateParam);
          const stateData = JSON.parse(Buffer.from(stateParam as string, "base64").toString());
          console.log("Parsed state data:", stateData);
          
          if (stateData.uid) {
            userId = stateData.uid;
            console.log("Restored user ID from state parameter:", userId);
            
            // Also set it in the session for downstream handlers
            if (!req.session.user) {
              req.session.user = { uid: userId };
            }
          }
        } catch (error) {
          console.error("Failed to parse state parameter:", error);
        }
      }
      
      if (!userId) {
        console.error("No user ID found in session or state parameter");
        return done(new Error("No authenticated user found"));
      }

      // Create or update social account
      try {
        const skipWelcome = req.session?.skipWelcome || false;
        const account = await twitterService.createSocialAccount(
          userId,
          userData.data,
          accessToken,
          refreshToken,
          req.session?.user?.organizationId,
          req.session?.user?.currentTeamId
        );

        // Only post welcome tweet if not skipped
        if (!skipWelcome && !account.welcomeTweetSent) {
          try {
            console.log("Attempting to post welcome tweet...");
            await twitterService.postWelcomeTweet(
              account.id,
              userData.data.name
            );

            // Mark that we've sent the welcome tweet
            const db = firestore();
            await db.collection("social_accounts").doc(account.id).update({
              welcomeTweetSent: true,
            });

            console.log("Welcome tweet posted successfully");
          } catch (tweetError: any) {
            // If welcome tweet fails due to duplicate content, we can ignore it
            // This might happen if the account was reconnected
            if (
              tweetError.message &&
              (tweetError.message.includes("duplicate content") ||
                tweetError.message.includes("duplicate status") ||
                tweetError.message.includes("already tweeted"))
            ) {
              console.log("Welcome tweet already posted (duplicate content)");

              // Still mark the account as having sent a welcome tweet
              const db = firestore();
              await db.collection("social_accounts").doc(account.id).update({
                welcomeTweetSent: true,
              });
            } else {
              // For other errors, delete the account and report the error
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
                  new Error(
                    "Twitter integration failed: Unable to post to Twitter"
                  )
                );
              }
            }
          }
        } else {
          console.log("Skipping welcome tweet as requested");
        }

        return done(null, account);
      } catch (accountError: any) {
        // Handle the case where the account is already connected to another user
        if (accountError.code === "account_already_connected") {
          console.warn(
            "Attempted to connect already connected account:",
            accountError.details
          );
          return done(accountError);
        }

        // Handle other errors
        console.error("Error creating/updating social account:", accountError);
        return done(new Error("Failed to connect Twitter account"));
      }
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

// Override the OAuth2Strategy's userProfile method to handle our custom state
(strategy as any).userProfile = function(accessToken: string, done: any) {
  // This is a no-op as we handle profile fetching in the callback
  done(null, {});
};

// Override the authenticate method to preserve the state parameter
const originalAuthenticate = (strategy as any).authenticate;
(strategy as any).authenticate = function(req: any, options: any) {
  // Log all request details for debugging
  console.log("Twitter auth request:", {
    url: req.url,
    query: req.query,
    session: req.session,
    headers: req.headers,
  });
  
  // If this is the initial auth request and we have a state parameter in the query
  if (req.query.state && !req.url.includes('/callback')) {
    console.log("Initial auth request with state:", req.query.state);
    
    // Make sure options has an authorizationURL property
    options = options || {};
    
    // Modify the authorization URL to include our state parameter
    const authURL = new URL(this._oauth2._authorizeUrl);
    authURL.searchParams.append('state', req.query.state);
    
    // Override the authorization URL for this request only
    this._oauth2._authorizeUrl = authURL.toString();
    console.log("Modified authorization URL to include state:", this._oauth2._authorizeUrl);
  }
  
  // If this is the callback and we have a state parameter, make sure it's available in the verify callback
  if (req.query.state && req.url.includes('/callback')) {
    // Store the state in the request object so it's available in the verify callback
    req._twitterState = req.query.state;
    console.log("Stored Twitter state for verify callback:", req._twitterState);
    
    try {
      // Try to parse the state parameter
      const stateData = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString());
      console.log("Parsed state data:", stateData);
      
      // If we have a user ID in the state, restore the user object
      if (stateData.uid) {
        req.user = { uid: stateData.uid };
        console.log("Restored user from state parameter:", req.user);
      }
    } catch (error) {
      console.error("Failed to parse state parameter:", error);
    }
  }
  
  // Call the original authenticate method
  return originalAuthenticate.call(this, req, options);
};

// Use type assertion to access protected property
(strategy as any)._oauth2.getOAuthAccessToken = getOAuthAccessToken;

// Register strategies
passport.use("oauth2", strategy);
passport.use("threads", threadsStrategy);

export default passport;
