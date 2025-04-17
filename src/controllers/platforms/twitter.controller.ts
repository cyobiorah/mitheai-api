import * as twitterService from "../../services/platforms/twitter.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";

const rawCallbackUrl: string | undefined = process.env.TWITTER_CALLBACK_URL;

if (!rawCallbackUrl) {
  throw new Error(
    "Missing Twitter callback URL for environment: " + process.env.NODE_ENV
  );
}

const callbackUrl =
  process.env.NODE_ENV === "development"
    ? rawCallbackUrl.replace(/:\d+/, ":3001")
    : rawCallbackUrl;

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

// GET /platforms/twitter/direct-auth
export const startDirectTwitterOAuth = async (req: any, res: any) => {
  console.log({ req });
  //   try {
  //     const { redirectUri } = req.query;
  //     const { url, state } = await twitterService.getTwitterOAuthUrl(
  //       redirectUri as string
  //     );
  //     // Store state in Redis for CSRF protection
  //     await redisService.set(`twitter-oauth-state:${state}`, state);
  //     res.json({ url });
  //   } catch (err) {
  //     next(err);
  //   }

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

    // Generate a unique state ID
    const stateId = crypto.randomBytes(16).toString("hex");

    console.log({ user: req.user });

    // Create state data object
    const stateData = {
      userId: req.user.userId,
      email: req.user.email,
      organizationId: req.user.organizationId,
      currentTeamId: req.user.currentTeamId,
      skipWelcome,
      timestamp: Date.now(),
      codeVerifier,
    };

    // console.log({ stateData });

    // Store in Redis with 10 minute expiration
    await redisService.set(`oauth:${stateId}`, stateData, 600);

    // Build the authorization URL
    const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", process.env.TWITTER_CLIENT_ID!);
    authUrl.searchParams.append("redirect_uri", callbackUrl);
    authUrl.searchParams.append(
      "scope",
      "tweet.read tweet.write users.read offline.access"
    );
    authUrl.searchParams.append("state", stateId);
    authUrl.searchParams.append("code_challenge", codeChallenge);
    authUrl.searchParams.append("code_challenge_method", "S256");

    console.log("Generated auth URL with PKCE and Redis state:", {
      stateId,
      url: authUrl.toString().substring(0, 100) + "...",
    });

    res.send(authUrl.toString());
  } catch (error) {
    console.error("Error in direct-auth:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

// GET /platforms/twitter/callback
export const handleTwitterCallback = async (req: any, res: any) => {
  try {
    console.log("Twitter callback received:", {
      query: {
        state: req.query.state ?? "Missing",
        code: req.query.code
          ? req.query.code.substring(0, 30) + "..."
          : "Missing",
      },
    });

    // Check for error in the callback
    if (req.query.error) {
      console.error("Twitter OAuth error:", req.query.error);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
          req.query.error_description ?? "Authentication failed"
        )}`
      );
    }

    // Check for authorization code and state
    const { code, state } = req.query;
    if (!code || !state) {
      console.error("Missing code or state parameter");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
          "Missing required parameters"
        )}`
      );
    }

    // Retrieve state data from Redis
    const stateData = await redisService.get(`oauth:${state}`);

    console.log("OAuth stateData from Redis:", stateData);

    if (!stateData) {
      console.error("No state data found in Redis");
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
          "Authentication session expired or invalid"
        )}`
      );
    }

    // Check for timestamp expiration (10 minute window)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`oauth:${state}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
          "Authentication link expired"
        )}`
      );
    }

    // Extract data from state
    const { codeVerifier, userId, organizationId, currentTeamId, skipWelcome } =
      stateData;

    // // If no session data, try to get from state parameter
    // if ((!codeVerifier || !userId) && state) {
    //   try {
    //     // Decrypt the state parameter
    //     const stateData = JSON.parse(
    //       Buffer.from(state as string, "base64").toString()
    //     );
    //     console.log("Parsed state data:", {
    //       uid: stateData.uid,
    //       hasCodeVerifier: !!stateData.codeVerifier,
    //       timestamp: stateData.timestamp,
    //     });

    //     // Check for timestamp expiration (10 minute window)
    //     if (
    //       stateData.timestamp &&
    //       Date.now() - stateData.timestamp > 10 * 60 * 1000
    //     ) {
    //       return res.redirect(
    //         `${
    //           process.env.FRONTEND_URL
    //         }/account-setup?error=true&message=${encodeURIComponent(
    //           "Authentication link expired"
    //         )}`
    //       );
    //     }

    //     // Extract data from state
    //     // codeVerifier = stateData.codeVerifier;
    //     // userId = stateData.uid;
    //     // organizationId = stateData.organizationId;
    //     // teamIds = stateData.teamIds;
    //     // currentTeamId = stateData.currentTeamId;
    //     // skipWelcome = stateData.skipWelcome;

    //     // Restore session if possible
    //     if (userId && !req.session.user) {
    //       req.session.user = {
    //         uid: userId,
    //         email: stateData.email,
    //         organizationId,
    //         // teamIds,
    //         currentTeamId,
    //       };
    //       req.session.skipWelcome = skipWelcome;
    //       req.session.codeVerifier = codeVerifier;

    //       // Save the session
    //       await new Promise<void>((resolve, reject) => {
    //         req.session.save((err: any) => {
    //           if (err) {
    //             console.error("Error saving session:", err);
    //             reject(err as Error);
    //           } else {
    //             resolve();
    //           }
    //         });
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error in Twitter callback:", error);
    //     return res.redirect(
    //       `${
    //         process.env.FRONTEND_URL
    //       }/account-setup?error=true&message=${encodeURIComponent(
    //         "Authentication failed: " +
    //           (error instanceof Error ? error.message : "Unknown error")
    //       )}`
    //     );
    //   }
    // }

    console.log("Proceeding with token exchange:", {
      code: (code as string).substring(0, 10) + "...",
      codeVerifier: codeVerifier.substring(0, 10) + "...",
      redirect_uri: callbackUrl,
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
          redirect_uri: callbackUrl,
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
      } catch (e: any) {
        console.log({ e });
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
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

    // Get Twitter profile
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
        }/account-setup?error=true&message=${encodeURIComponent(
          "Failed to fetch Twitter profile"
        )}`
      );
    }

    const profileData = (await profileResponse.json()) as TwitterUserResponse;
    // console.log("Twitter user profile:", profileData);

    // Create or update the social account
    try {
      // We need to use the controller's instance since it's already initialized
      //   const twitterService = controller.getTwitterService();

      if (!twitterService) {
        throw new Error("Failed to get TwitterService instance");
      }

      await twitterService.createSocialAccount(
        userId,
        profileData.data,
        tokenData.access_token,
        tokenData.refresh_token ?? "",
        organizationId,
        currentTeamId
      );

      // Post welcome tweet if needed
      //   if (!skipWelcome && !account.welcomeTweetSent) {
      //     try {
      //       console.log("Posting welcome tweet...");
      //       // await twitterService.postWelcomeTweet(
      //       //   account._id,
      //       //   profileData.data.name
      //       // );

      //       // Use the controller's social account service
      //       const socialAccountService = controller.getSocialAccountService();
      //       if (!socialAccountService) {
      //         throw new Error("Failed to get SocialAccountService instance");
      //       }

      //       // Mark that we've sent the welcome tweet
      //       await socialAccountService.update(account._id.toString(), {
      //         welcomeTweetSent: true,
      //       });

      //       console.log("Welcome tweet posted successfully");
      //     } catch (tweetError: any) {
      //       // Handle duplicate content errors
      //       if (
      //         tweetError.message &&
      //         (tweetError.message.includes("duplicate content") ||
      //           tweetError.message.includes("duplicate status") ||
      //           tweetError.message.includes("already tweeted"))
      //       ) {
      //         console.log("Welcome tweet already posted (duplicate content)");

      //         // Still mark the account as having sent a welcome tweet
      //         const socialAccountService = controller.getSocialAccountService();
      //         if (socialAccountService) {
      //           await socialAccountService.update(account._id.toString(), {
      //             welcomeTweetSent: true,
      //           });
      //         }
      //       } else {
      //         console.error("Failed to post welcome tweet:", tweetError);
      //       }
      //     }
      //   }

      // Clear the code verifier from session as it's no longer needed
      if (req.user) {
        req.user.codeVerifier = undefined;
        await new Promise<void>((resolve) => {
          req.user.save(() => resolve());
        });
      }

      // Redirect to settings page with success message
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?success=true&message=${encodeURIComponent(
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
          }/account-setup?error=duplicate_account&message=${encodeURIComponent(
            error.message
          )}`
        );
      }

      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/account-setup?error=true&message=${encodeURIComponent(
          `Failed to create social account: ${error.message}`
        )}`
      );
    }
  } catch (error: any) {
    console.error("Twitter callback error:", error);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/account-setup?error=true&message=${encodeURIComponent(
        `Authentication error: ${error.message}`
      )}`
    );
  }
};
