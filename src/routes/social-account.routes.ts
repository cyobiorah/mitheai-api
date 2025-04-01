import { Router } from "express";
import { SocialAccountController } from "../controllers/social-account.controller";
import {
  authenticateToken,
  belongsToTeam,
  requireOrgAccess,
} from "../middleware/auth.middleware";
import passport from "../config/passport.config";
import { validateSocialAccountOperation } from "../middleware/social-account.middleware";
import facebookRoutes from "./facebook.routes";
import threadsRoutes from "./threads.routes";
import * as crypto from "crypto";
import { TwitterService } from "../services/twitter.service";
import { SocialAccountService } from "../services/social-account.service";

// Extend express-session types
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

interface TwitterTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface TwitterUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
    };
  };
}

const router = Router();
const controller = new SocialAccountController();

// Mount Facebook routes
router.use("/", facebookRoutes);

// Mount Threads routes
router.use("/", threadsRoutes);

// Get all social accounts for the authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const accounts = await controller.getSocialAccounts(req.user.uid);
    res.json(accounts || []); // Ensure we always return an array
  } catch (error) {
    console.error("Error fetching social accounts:", error);
    res.status(500).json({ error: "Failed to fetch social accounts" });
  }
});

// Twitter direct auth route
// router.get("/twitter/direct-auth", authenticateToken, (req: any, res) => {
//   try {
//     // Generate code verifier and challenge for PKCE
//     const codeVerifier = crypto.randomBytes(32).toString("hex");
//     const codeChallenge = crypto
//       .createHash("sha256")
//       .update(codeVerifier)
//       .digest("base64")
//       .replace(/\+/g, "-")
//       .replace(/\//g, "_")
//       .replace(/=/g, "");

//     // Generate a state parameter to prevent CSRF
//     // const state = crypto.randomBytes(16).toString("hex");

//     // Store user data and code verifier in an encrypted state parameter
//     // This allows us to recover the data in serverless environments where session might not persist
//     const stateData = {
//       uid: req.user.uid,
//       email: req.user.email,
//       organizationId: req.user.organizationId,
//       teamIds: req.user.teamIds,
//       currentTeamId:
//         req.user.currentTeamId || (req.user.teamIds && req.user.teamIds[0]),
//       codeVerifier: codeVerifier,
//       timestamp: Date.now(),
//       skipWelcome: req.query.skipWelcome === "true",
//     };

//     // Encrypt the state data
//     const encryptedState = Buffer.from(JSON.stringify(stateData)).toString(
//       "base64"
//     );

//     // Store in session as backup if session works
//     req.session.codeVerifier = codeVerifier;
//     req.session.skipWelcome = req.query.skipWelcome === "true";

//     // Save session
//     req.session.save((err: any) => {
//       if (err) {
//         console.error("Session save error:", err);
//       }

//       // Redirect to Twitter auth with PKCE
//       const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
//       authUrl.searchParams.append("response_type", "code");
//       authUrl.searchParams.append(
//         "client_id",
//         process.env.TWITTER_CLIENT_ID || ""
//       );
//       authUrl.searchParams.append(
//         "redirect_uri",
//         process.env.TWITTER_CALLBACK_URL ||
//           "http://localhost:3001/api/social-accounts/twitter/callback"
//       );
//       authUrl.searchParams.append(
//         "scope",
//         "tweet.read tweet.write users.read offline.access"
//       );
//       authUrl.searchParams.append("state", encryptedState);
//       authUrl.searchParams.append("code_challenge", codeChallenge);
//       authUrl.searchParams.append("code_challenge_method", "S256");

//       console.log("Redirecting to Twitter auth with PKCE:", {
//         codeVerifier: codeVerifier.substring(0, 10) + "...",
//         codeChallenge: codeChallenge.substring(0, 10) + "...",
//         state: encryptedState.substring(0, 10) + "...",
//       });

//       res.redirect(authUrl.toString());
//     });
//   } catch (error) {
//     console.error("Twitter direct auth error:", error);
//     res.status(500).json({
//       error: "Failed to initiate Twitter authentication",
//       message: error instanceof Error ? error.message : String(error),
//     });
//   }
// });

// Twitter OAuth routes
router.get("/twitter/direct-auth", authenticateToken, (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const skipWelcome = req.query.skipWelcome === "true";

    // Generate PKCE code verifier (43-128 chars)
    const codeVerifier = crypto
      .randomBytes(64)
      .toString("base64url")
      .substring(0, 64);

    // Generate code challenge using SHA-256
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Store user data and PKCE info in session
    req.session.user = req.user;
    req.session.skipWelcome = skipWelcome;
    req.session.codeVerifier = codeVerifier;

    // Generate a random state string for CSRF protection
    const randomState = crypto.randomBytes(16).toString("hex");

    // Create user data object to encode in state
    const userData = {
      uid: req.user.uid,
      email: req.user.email,
      organizationId: req.user.organizationId,
      currentTeamId: req.user.currentTeamId,
      skipWelcome,
      timestamp: Date.now(),
      codeVerifier, // Include code verifier in the state
    };

    // Encode user data as base64
    const encodedUserData = Buffer.from(JSON.stringify(userData)).toString(
      "base64"
    );

    // Force session save and wait for it to complete
    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error:", err);
        return res
          .status(500)
          .json({ error: "Session error", details: err.message });
      }

      console.log("Session saved successfully:", {
        sessionID: req.sessionID,
        hasUser: !!req.session.user,
        codeVerifier: codeVerifier.substring(0, 10) + "...",
        codeChallenge: codeChallenge.substring(0, 10) + "...",
      });

      // Build the authorization URL manually with all required parameters
      const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
      authUrl.searchParams.append("response_type", "code");
      authUrl.searchParams.append("client_id", process.env.TWITTER_CLIENT_ID!);
      authUrl.searchParams.append(
        "redirect_uri",
        process.env.TWITTER_CALLBACK_URL ||
          process.env.API_URL + "/api/social-accounts/twitter/callback"
      );
      authUrl.searchParams.append(
        "scope",
        "tweet.read tweet.write users.read offline.access"
      );
      authUrl.searchParams.append("state", randomState);
      authUrl.searchParams.append("code_challenge", codeChallenge);
      authUrl.searchParams.append("code_challenge_method", "S256");
      authUrl.searchParams.append("user_data", encodedUserData);

      console.log("Generated auth URL with PKCE:", {
        url: authUrl.toString(),
        redirect_uri: authUrl.searchParams.get("redirect_uri"),
        code_challenge:
          authUrl.searchParams.get("code_challenge")?.substring(0, 10) + "...",
        code_challenge_method: authUrl.searchParams.get(
          "code_challenge_method"
        ),
      });

      res.send(authUrl.toString());
    });
  } catch (error) {
    console.error("Error in direct-auth:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Update the auth route to use state parameter if session is missing
router.get(
  "/twitter/auth",
  (req: any, res, next) => {
    // Check if we have user data in session
    if (req.session.user) {
      console.log("Session found for Twitter auth:", {
        user: req.session.user,
        skipWelcome: req.session.skipWelcome,
      });
      return next();
    }

    // For serverless: check for state parameter and user_data
    const { state, user_data } = req.query;
    if (!state || !user_data) {
      console.error("No state or user_data parameter found in request:", {
        query: req.query,
        cookies: req.headers.cookie,
      });
      return res
        .status(400)
        .json({ error: "Missing state or user_data parameter" });
    }

    try {
      // Decode and validate the user_data parameter
      const userData = JSON.parse(
        Buffer.from(user_data as string, "base64").toString()
      );

      // Check for timestamp expiration (10 minute window)
      const now = Date.now();
      const timestamp = userData.timestamp || 0;
      if (now - timestamp > 10 * 60 * 1000) {
        return res.status(401).json({ error: "Authentication link expired" });
      }

      // Restore user data to session
      req.session.user = {
        uid: userData.uid,
        email: userData.email,
      };
      req.session.skipWelcome = userData.skipWelcome;

      // Store the state in the session for the callback
      req.session._twitterState = state;

      console.log("Restored session from user_data parameter:", {
        user: req.session.user,
        skipWelcome: req.session.skipWelcome,
        state,
      });

      // Save the session before continuing
      req.session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        next();
      });
    } catch (error) {
      console.error("Failed to parse user_data parameter:", error);
      return res.status(400).json({ error: "Invalid user_data parameter" });
    }
  },
  passport.authenticate("oauth2", {
    scope: ["tweet.read", "tweet.write", "users.read", "offline.access"],
  })
);

// Twitter callback route
router.get("/twitter/callback", async (req: any, res) => {
  try {
    console.log("Twitter callback received:", {
      query: req.query,
      session: req.session
        ? {
            id: req.sessionID,
            hasUser: !!req.session.user,
            hasCodeVerifier: !!req.session.codeVerifier,
          }
        : "No session",
      cookies: req.headers.cookie ? "Present" : "None",
    });

    // Check for error in the callback
    if (req.query.error) {
      console.error("Twitter OAuth error:", req.query.error);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=true&message=${encodeURIComponent(
          req.query.error_description || "Authentication failed"
        )}`
      );
    }

    // Check for authorization code
    const { code, state } = req.query;
    if (!code) {
      console.error("No authorization code in callback");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=true&message=${encodeURIComponent(
          "No authorization code received"
        )}`
      );
    }

    // Get code verifier and user data from state parameter
    let codeVerifier = req.session?.codeVerifier;
    let userId = req.session?.user?.uid;
    let organizationId = req.session?.user?.organizationId;
    let teamIds = req.session?.user?.teamIds;
    let currentTeamId = req.session?.user?.currentTeamId;
    let skipWelcome = req.session?.skipWelcome;

    // If no session data, try to get from state parameter
    if ((!codeVerifier || !userId) && state) {
      try {
        // Decrypt the state parameter
        const stateData = JSON.parse(
          Buffer.from(state as string, "base64").toString()
        );
        console.log("Parsed state data:", {
          uid: stateData.uid,
          hasCodeVerifier: !!stateData.codeVerifier,
          timestamp: stateData.timestamp,
        });

        // Check for timestamp expiration (10 minute window)
        if (
          stateData.timestamp &&
          Date.now() - stateData.timestamp > 10 * 60 * 1000
        ) {
          return res.redirect(
            `${
              process.env.FRONTEND_URL
            }/settings?error=true&message=${encodeURIComponent(
              "Authentication link expired"
            )}`
          );
        }

        // Extract data from state
        codeVerifier = stateData.codeVerifier;
        userId = stateData.uid;
        organizationId = stateData.organizationId;
        teamIds = stateData.teamIds;
        currentTeamId = stateData.currentTeamId;
        skipWelcome = stateData.skipWelcome;

        // Restore session if possible
        if (userId && !req.session.user) {
          req.session.user = {
            uid: userId,
            email: stateData.email,
            organizationId,
            teamIds,
            currentTeamId,
          };
          req.session.skipWelcome = skipWelcome;
          req.session.codeVerifier = codeVerifier;

          // Save the session
          await new Promise<void>((resolve, reject) => {
            req.session.save((err: any) => {
              if (err) {
                console.error("Error saving session:", err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }
      } catch (error) {
        console.error("Error parsing state parameter:", error);
      }
    }

    console.log("Proceeding with token exchange:", {
      code: (code as string).substring(0, 10) + "...",
      codeVerifier: codeVerifier.substring(0, 10) + "...",
      redirect_uri:
        process.env.TWITTER_CALLBACK_URL ||
        "http://localhost:3001/api/social-accounts/twitter/callback",
    });

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(
      "https://api.twitter.com/2/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri:
            process.env.TWITTER_CALLBACK_URL ||
            "http://localhost:3001/api/social-accounts/twitter/callback",
          code_verifier: codeVerifier,
        }).toString(),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText,
      });

      try {
        const errorData = JSON.parse(errorText);
        console.error("Token exchange error details:", errorData);
      } catch (e) {
        // If it's not JSON, just log the raw text
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=true&message=${encodeURIComponent(
          `Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`
        )}`
      );
    }

    const tokenData = (await tokenResponse.json()) as TwitterTokenResponse;
    console.log("Token exchange successful:", {
      accessToken: tokenData.access_token
        ? tokenData.access_token.substring(0, 10) + "..."
        : "none",
      refreshToken: tokenData.refresh_token
        ? tokenData.refresh_token.substring(0, 10) + "..."
        : "none",
    });

    // Get user profile from Twitter API
    const profileResponse = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url,public_metrics",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "User-Agent": "MitheAI/1.0",
        },
      }
    );

    if (!profileResponse.ok) {
      console.error("Failed to fetch user profile:", {
        status: profileResponse.status,
        statusText: profileResponse.statusText,
      });
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=true&message=${encodeURIComponent(
          "Failed to fetch Twitter profile"
        )}`
      );
    }

    const profileData = (await profileResponse.json()) as TwitterUserResponse;
    console.log("Twitter user profile:", profileData);

    // Create or update the social account
    try {
      // We need to use the controller's instance since it's already initialized
      const twitterService = controller.getTwitterService();

      if (!twitterService) {
        throw new Error("Failed to get TwitterService instance");
      }

      const account = await twitterService.createSocialAccount(
        userId,
        profileData.data,
        tokenData.access_token,
        tokenData.refresh_token ?? "",
        organizationId,
        currentTeamId
      );

      // Post welcome tweet if needed
      if (!skipWelcome && !account.welcomeTweetSent) {
        try {
          console.log("Posting welcome tweet...");
          await twitterService.postWelcomeTweet(
            account.id,
            profileData.data.name
          );

          // Use the controller's social account service
          const socialAccountService = controller.getSocialAccountService();
          if (!socialAccountService) {
            throw new Error("Failed to get SocialAccountService instance");
          }

          // Mark that we've sent the welcome tweet
          await socialAccountService.update(account.id, {
            welcomeTweetSent: true,
          });

          console.log("Welcome tweet posted successfully");
        } catch (tweetError: any) {
          // Handle duplicate content errors
          if (
            tweetError.message &&
            (tweetError.message.includes("duplicate content") ||
              tweetError.message.includes("duplicate status") ||
              tweetError.message.includes("already tweeted"))
          ) {
            console.log("Welcome tweet already posted (duplicate content)");

            // Still mark the account as having sent a welcome tweet
            const socialAccountService = controller.getSocialAccountService();
            if (socialAccountService) {
              await socialAccountService.update(account.id, {
                welcomeTweetSent: true,
              });
            }
          } else {
            console.error("Failed to post welcome tweet:", tweetError);
          }
        }
      }

      // Clear the code verifier from session as it's no longer needed
      if (req.session) {
        req.session.codeVerifier = undefined;
        await new Promise<void>((resolve) => {
          req.session.save(() => resolve());
        });
      }

      // Redirect to settings page with success message
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?success=true&message=${encodeURIComponent(
          "Twitter account connected successfully"
        )}`
      );
    } catch (error: any) {
      console.error("Failed to create social account:", error);

      // Check for specific error types
      if (error.code === "account_already_connected") {
        // Redirect with specific error for duplicate accounts
        return res.redirect(
          `${
            process.env.FRONTEND_URL
          }/settings?error=duplicate_account&message=${encodeURIComponent(
            error.message
          )}`
        );
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/settings?error=true&message=${encodeURIComponent(
          `Failed to create social account: ${error.message}`
        )}`
      );
    }
  } catch (error: any) {
    console.error("Twitter callback error:", error);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/settings?error=true&message=${encodeURIComponent(
        `Authentication error: ${error.message}`
      )}`
    );
  }
});

// Facebook direct auth route similar to Twitter
router.get("/facebook/direct-auth", authenticateToken, (req: any, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Store user data in session
    req.session.user = req.user;
    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Session error" });
      }

      // Return the full URL
      const baseUrl = process.env.API_URL ?? "http://localhost:3001";
      res.send(`${baseUrl}/api/social-accounts/facebook`);
    });
  } catch (error) {
    console.error("Error in Facebook direct-auth:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Disconnect social account by ID (not platform)
router.post("/disconnect/:accountId", authenticateToken, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Pass the entire request and response objects to the controller
    await controller.disconnectSocialAccount(req, res);
  } catch (error: any) {
    console.error("Error disconnecting account:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message || "Unknown error occurred",
    });
  }
});

// Legacy endpoint - maintain for backward compatibility but updated to use account ID
router.post("/:platform/disconnect", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // For backward compatibility - get the account ID from the request body
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({
        error: "Account ID is required",
        message: "Please provide an account ID to disconnect",
      });
    }
    // Call the updated disconnectAccount method with account ID
    const result = await controller.disconnectSocialAccount(
      req.user.uid,
      accountId
    );
    res.json(result);
  } catch (error: any) {
    console.error("Error disconnecting account:", error);
    res.status(500).json({
      error: "Failed to disconnect account",
      message: error.message || "Unknown error occurred",
    });
  }
});

// New endpoints for MongoDB implementation
router.get(
  "/user",
  authenticateToken,
  controller.getUserSocialAccounts.bind(controller)
);

router.get(
  "/organization/:organizationId",
  authenticateToken,
  requireOrgAccess(),
  controller.getOrganizationSocialAccounts.bind(controller)
);

router.get(
  "/team/:teamId",
  authenticateToken,
  belongsToTeam(),
  controller.getTeamSocialAccounts.bind(controller)
);

// Tweet management routes - add validateSocialAccountOperation middleware once created
router.post(
  "/twitter/tweet",
  authenticateToken,
  validateSocialAccountOperation,
  controller.postTweet.bind(controller)
);
router.post(
  "/twitter/schedule",
  authenticateToken,
  validateSocialAccountOperation,
  controller.scheduleTweet.bind(controller)
);

// Debug endpoint for testing Twitter API connectivity
router.post(
  "/twitter/debug-connection",
  authenticateToken,
  validateSocialAccountOperation,
  controller.debugTwitterConnection.bind(controller)
);

router.get(
  "/twitter/debug/:accountId",
  authenticateToken,
  validateSocialAccountOperation,
  controller.debugTwitterAccount.bind(controller)
);

router.post(
  "/:accountId/team",
  authenticateToken,
  // validateSocialAccountOperation,
  requireOrgAccess,
  controller.assignTeam.bind(controller)
);

export default router;
