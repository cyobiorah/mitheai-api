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
// Create a code verifier mapping to store PKCE code verifiers
const codeVerifierMap = new Map<string, string>();

// Generate a random string for PKCE
function generateRandomString(length: number): string {
  // Use only alphanumeric characters to avoid any issues with special characters
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Generate a code challenge from a code verifier (for Twitter, we'll use plain method)
function generateCodeChallenge(codeVerifier: string): string {
  // For Twitter's implementation with code_challenge_method=plain,
  // the code challenge is the same as the code verifier
  return codeVerifier;
}

// Override the authenticate method to preserve the state parameter
const originalAuthenticate = (strategy as any).authenticate;
(strategy as any).authenticate = function (req: any, options: any) {
  // Log all request details for debugging
  console.log("Twitter auth request:", {
    url: req.url,
    query: req.query,
    session: req.session,
    headers: req.headers,
  });

  // If this is the initial auth request and we have a state parameter in the query
  if (req.query.state && !req.url.includes("/callback")) {
    console.log("Initial auth request with state:", req.query.state);

    // Generate a random state key for Twitter
    const twitterState = Math.random().toString(36).substring(2, 15);

    // Store our state mapped to Twitter's state
    stateMap.set(twitterState, req.query.state as string);
    console.log(
      `Mapped our state to Twitter state: ${twitterState} -> ${req.query.state}`
    );

    // Use a fixed code verifier for testing (matches Twitter's documentation example)
    const codeVerifier = "challenge";
    codeVerifierMap.set(twitterState, codeVerifier);
    console.log(
      `Using fixed code verifier for state ${twitterState}:`,
      codeVerifier
    );

    // Generate a code challenge (for Twitter, using plain method)
    const codeChallenge = generateCodeChallenge(codeVerifier);
    console.log(`Generated code challenge:`, codeChallenge);

    // Make sure options has an authorizationParams property
    options = options || {};
    options.authorizationParams = options.authorizationParams || {};

    // Set the state parameter
    options.state = twitterState;

    // Add PKCE parameters to the authorization request
    options.authorizationParams.code_challenge = codeChallenge;
    options.authorizationParams.code_challenge_method = 'plain';

    // Store the code verifier globally so it's accessible during token exchange
    this._codeVerifier = codeVerifier;
    if (this._oauth2) {
      this._oauth2._codeVerifier = codeVerifier;
    }

    console.log("Using Twitter state:", twitterState);
    console.log("Using code challenge:", codeChallenge);
  }

  // If this is the callback and we have a state parameter, make sure it's available in the verify callback
  if (req.query.state && req.url.includes("/callback")) {
    const twitterState = req.query.state as string;
    console.log("Received Twitter state in callback:", twitterState);

    // Look up our original state from the map
    const ourState = stateMap.get(twitterState);

    if (ourState) {
      console.log("Found our state in map:", ourState);

      // Replace Twitter's state with our state
      req.query.state = ourState;

      // Store the state in the request object so it's available in the verify callback
      req._twitterState = ourState;
      console.log("Restored our state parameter:", ourState);

      // Get the code verifier for this state
      const codeVerifier = codeVerifierMap.get(twitterState);
      if (codeVerifier) {
        console.log("Found code verifier for state:", twitterState);

        // Store the code verifier in multiple places to ensure it's available during token exchange
        req._codeVerifier = codeVerifier;
        this._codeVerifier = codeVerifier;

        // Also store it directly on the OAuth2 instance
        if (this._oauth2) {
          this._oauth2._codeVerifier = codeVerifier;
        }

        console.log("Stored code verifier for token exchange:", codeVerifier);
      } else {
        console.warn("No code verifier found for state:", twitterState);
      }

      try {
        // Try to parse the state parameter
        const stateData = JSON.parse(
          Buffer.from(ourState, "base64").toString()
        );
        console.log("Parsed state data:", stateData);

        // If we have a user ID in the state, restore the user object
        if (stateData.uid) {
          req.user = { uid: stateData.uid };
          console.log("Restored user from state parameter:", req.user);
        }
      } catch (error) {
        console.error("Failed to parse state parameter:", error);
      }

      // Clean up the maps
      stateMap.delete(twitterState);
      codeVerifierMap.delete(twitterState);
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

  // Find the code verifier for this request
  let codeVerifier = null;

  // Try to get it from various places
  if (this._codeVerifier) {
    codeVerifier = this._codeVerifier;
    console.log("Found code_verifier on OAuth2 instance:", codeVerifier);
  } else if (this._oauth2?._codeVerifier) {
    codeVerifier = this._oauth2._codeVerifier;
    console.log(
      "Found code_verifier on OAuth2._oauth2 instance:",
      codeVerifier
    );
  }

  // Add the code_verifier if we found it
  if (codeVerifier) {
    console.log("Adding code_verifier to token request:", codeVerifier);
    finalParams.code_verifier = codeVerifier;
  } else {
    console.warn("No code_verifier found for token request");
  }

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
(strategy as any).userProfile = function (accessToken: string, done: any) {
  // This is a no-op as we handle profile fetching in the callback
  done(null, {});
};

// Use type assertion to access protected property
(strategy as any)._oauth2.getOAuthAccessToken = getOAuthAccessToken;

// Register strategies
passport.use("oauth2", strategy);
passport.use("threads", threadsStrategy);

export default passport;
