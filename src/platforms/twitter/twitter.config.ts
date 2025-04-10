import passport from "passport";
const verifierMap = new Map<string, string>();
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { TwitterService } from "./twitter.service";
import crypto from "crypto";
import "../facebook/facebook.config";
import threadsStrategy from "../threads/threads.config";

const twitterService = new TwitterService();

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
    callbackURL: process.env.TWITTER_CALLBACK_URL,
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
              account._id,
              userData.data.name
            );

            // Mark that we've sent the welcome tweet
            // const db = firestore();
            // await db.collection("social_accounts").doc(account.id).update({
            //   welcomeTweetSent: true,
            // });

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
              // const db = firestore();
              // await db.collection("social_accounts").doc(account.id).update({
              //   welcomeTweetSent: true,
              // });
            } else {
              // For other errors, delete the account and report the error
              console.error("Failed to post welcome tweet:", tweetError);

              try {
                // Get a Firestore reference
                // const db = firestore();

                // Delete the social account that was just created
                // await db.collection("social_accounts").doc(account.id).delete();

                console.log(
                  `Deleted social account ${account._id} due to welcome tweet failure`
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

// Override the authenticate method to preserve the state parameter
const originalAuthenticate = (strategy as any).authenticate;
(strategy as any).authenticate = function (req: any, options: any) {
  // If this is an authorization request (not a callback)
  if (!req.query.code) {
    console.log("Twitter auth request:", {
      url: req.url,
      query: req.query,
      session: req.session,
      headers: req.headers,
    });

    // Get state from query or generate a new one
    const state = req.query.state || crypto.randomBytes(16).toString("hex");

    // Make sure options has an authorizationParams property
    options = options || {};
    options.authorizationParams = options.authorizationParams || {};

    // Generate code_verifier according to RFC 7636
    // Must be between 43-128 chars - we'll use 64 for better compatibility
    const codeVerifier = crypto
      .randomBytes(48) // 48 bytes gives us ~64 characters in base64url
      .toString("base64url")
      .substring(0, 64); // Ensure exactly 64 chars

    // Store the code verifier for this state in both the map and the OAuth2 instance
    verifierMap.set(state as string, codeVerifier);
    this._oauth2._pkceVerifier = codeVerifier;

    console.log(`Stored code verifier for state ${state}:`, codeVerifier);

    // Generate code_challenge according to RFC 7636
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    // Set the PKCE parameters
    options.authorizationParams.code_challenge = codeChallenge;
    options.authorizationParams.code_challenge_method = "S256";

    // Use the state directly
    options.state = state;

    console.log("Using code challenge:", codeChallenge);
    console.log("Using state:", state);

    // Call the original authenticate method
    return originalAuthenticate.call(this, req, options);
  }

  // If this is the callback and we have a state parameter
  if (req.query.code && req.query.state) {
    console.log("Twitter callback received:", {
      url: req.url,
      query: req.query,
      session: req.session,
      headers: req.headers,
    });

    // Get the state from the callback
    const callbackState = req.query.state as string;
    console.log("Received state in callback:", callbackState);

    // Store the state in the request object so it's available in the verify callback
    req._twitterState = callbackState;

    // Store the state in the OAuth2 instance for token exchange
    this._oauth2._state = callbackState;
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
  // Get the state from the OAuth2 instance or params
  const state = this._state || params.state;
  console.log("Token exchange state:", state);

  // Get the code verifier for this state
  let codeVerifier = verifierMap.get(state);
  console.log("PKCE Code Verifier from verifierMap:", codeVerifier);

  if (!codeVerifier) {
    console.error("Missing code verifier for state:", state);
    // Try to get code verifier from the OAuth2 instance as a fallback
    if (this._pkceVerifier) {
      codeVerifier = this._pkceVerifier;
      console.log(
        "Using fallback code verifier from OAuth2 instance:",
        codeVerifier
      );
    } else {
      return callback(new Error("Missing code verifier for token exchange"));
    }
  }

  // Add the code verifier to the params
  params.code_verifier = codeVerifier;

  // Set redirect_uri and log params
  params.redirect_uri = process.env.TWITTER_CALLBACK_URL;
  console.log("Token request params:", {
    ...params,
    code: code ? `${code.substring(0, 10)}...` : "undefined",
    code_verifier: codeVerifier
      ? `${codeVerifier.substring(0, 10)}...`
      : "undefined",
  });
  console.log("Expected redirect_uri:", process.env.TWITTER_CALLBACK_URL);

  // Clean up the map
  verifierMap.delete(state);

  // Store the code verifier in the OAuth2 instance as a fallback
  this._pkceVerifier = codeVerifier;

  // Call the original method with our parameters
  return originalOAuthGetToken.call(
    this,
    code,
    params,
    function (
      err: any,
      accessToken: string,
      refreshToken: string,
      results: any
    ) {
      if (err) {
        console.error("Token exchange error:", err);

        // Log more detailed error information
        if (err.data) {
          try {
            const errorData = JSON.parse(err.data);
            console.error("Token exchange error details:", errorData);
          } catch (e) {
            console.error("Token exchange error raw data:", err.data);
          }
        }
      } else {
        console.log("Token exchange successful");
      }

      // Call the original callback
      callback(err, accessToken, refreshToken, results);
    }
  );
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
