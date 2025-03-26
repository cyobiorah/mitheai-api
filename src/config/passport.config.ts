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
  environment: process.env.NODE_ENV ?? "development",
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
    pkce: true, // Enable the built-in PKCE support
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
          const stateData = JSON.parse(
            Buffer.from(stateParam as string, "base64").toString()
          );
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

// Create a state mapping to store our state data
const stateMap = new Map<string, string>();

// Override the authenticate method to preserve the state parameter
const originalAuthenticate = (strategy as any).authenticate;
(strategy as any).authenticate = function (req: any, options: any) {
  // If this is an authorization request (not a callback)
  if (req.query.state && !req.query.code) {
    console.log("Twitter auth request:", {
      url: req.url,
      query: req.query,
      session: req.session,
      headers: req.headers,
    });

    // Generate a random state key for Twitter
    const twitterState = Math.random().toString(36).substring(2, 15);

    // Store our state mapped to Twitter's state
    stateMap.set(twitterState, req.query.state as string);
    console.log(
      `Mapped our state to Twitter state: ${twitterState} -> ${req.query.state}`
    );

    // Make sure options has an authorizationParams property
    options = options || {};
    options.authorizationParams = options.authorizationParams || {};

    // Set the state parameter
    options.state = twitterState;

    // Let the built-in PKCE handle code verifier and challenge
    console.log("Using built-in PKCE support");

    // Hack to access the code verifier that will be generated
    const originalGetAuthorizeUrl = this._oauth2.getAuthorizeUrl;
    this._oauth2.getAuthorizeUrl = function (params: any) {
      console.log("PKCE Code Verifier:", this._pkceVerifier);
      console.log("Authorization params:", params);
      return originalGetAuthorizeUrl.call(this, params);
    };

    // Call the original authenticate method
    return originalAuthenticate.call(this, req, options);
  }

  // If this is the callback and we have a state parameter, make sure it's available in the verify callback
  if (req.query.code && req.query.state) {
    console.log("Twitter callback received:", {
      url: req.url,
      query: req.query,
      session: req.session,
      headers: req.headers,
    });

    // Get the Twitter state from the callback
    const twitterState = req.query.state as string;
    console.log("Received Twitter state in callback:", twitterState);

    // Look up our original state
    const ourState = stateMap.get(twitterState);
    if (ourState) {
      console.log("Found our state in map:", ourState);

      // Replace Twitter's state with our state to maintain compatibility
      req.query.state = ourState;

      // Store it on the request object so it's available in the verify callback
      req._twitterState = ourState;
      console.log("Restored our state parameter:", ourState);

      try {
        // Try to parse the state parameter
        const stateData = JSON.parse(
          Buffer.from(ourState, "base64").toString("utf-8")
        );
        console.log("Parsed state data:", stateData);

        // If the state contains a user ID, restore the user object
        if (stateData.uid) {
          req.user = { uid: stateData.uid };
          console.log("Restored user from state parameter:", req.user);
        }
      } catch (e) {
        console.warn("Failed to parse state data:", e);
      }

      // Clean up the maps
      stateMap.delete(twitterState);
    } else {
      console.warn("Could not find our state for Twitter state:", twitterState);
    }
  }

  // Call the original authenticate method
  return originalAuthenticate.call(this, req, options);
};

// Override the OAuth2Strategy's state verification method
(strategy as any)._stateStore = {
  store: async function (req: any, callback: any) {
    // The state is already being handled in our authenticate override
    // Just call the callback with the state from the request
    const state =
      req.query.state || Math.random().toString(36).substring(2, 15);
    callback(null, state);
  },
  verify: async function (req: any, providedState: string, callback: any) {
    // Always consider the state valid since we're handling it in our authenticate override
    console.log("State verification bypassed for:", providedState);
    callback(null, true);
  },
};

// Override the token exchange method to add logging
const originalOAuthGetToken = (strategy as any)._oauth2.getOAuthAccessToken;
(strategy as any)._oauth2.getOAuthAccessToken = function (
  code: any,
  params: any,
  callback: any
) {
  console.log("Token exchange initiated with code:", code);
  console.log("Token exchange params:", params);
  console.log("PKCE Code Verifier for token exchange:", this._pkceVerifier);

  return originalOAuthGetToken.call(this, code, params, callback);
};

// Override the OAuth2Strategy's userProfile method to handle our custom state
(strategy as any).userProfile = function (accessToken: string, done: any) {
  // This is a no-op as we handle profile fetching in the callback
  done(null, {});
};

// Register strategies
passport.use("oauth2", strategy);
passport.use("threads", threadsStrategy);

export default passport;
