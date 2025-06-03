import { Request, Response as ExpressResponse } from "express";
import {
  createSocialAccount,
  exchangeCodeForTokens,
  post,
} from "../../services/platforms/tiktok.service";
import redisService from "../../utils/redisClient";
import * as crypto from "crypto";

const rawCallbackUrl: string = process.env.TIKTOK_REDIRECT_URI ?? "";

const callbackUrl =
  process.env.NODE_ENV === "development"
    ? rawCallbackUrl.replace(/:\d+/, ":3001")
    : rawCallbackUrl;

export const startDirectTikTokAuth = async (
  req: Request,
  res: ExpressResponse
) => {
  try {
    const { user } = req as any;

    if (!user) return res.status(401).json({ error: "Unauthorized" });

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

    const stateId = crypto.randomBytes(16).toString("hex");

    const stateData = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      currentTeamId: user.currentTeamId,
      skipWelcome,
      timestamp: Date.now(),
      codeVerifier,
    };

    await redisService.set(`tiktok:oauth:${stateId}`, stateData, 600); // 10 mins TTL

    const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authUrl.searchParams.append("client_key", process.env.TIKTOK_CLIENT_KEY!);
    authUrl.searchParams.append(
      "redirect_uri",
      process.env.TIKTOK_REDIRECT_URI!
    );
    // authUrl.searchParams.append("redirect_uri", callbackUrl);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append(
      "scope",
      "user.info.basic,video.upload,video.publish"
    );
    authUrl.searchParams.append("state", stateId);
    authUrl.searchParams.append("code_challenge", codeChallenge);
    authUrl.searchParams.append("code_challenge_method", "S256");
    authUrl.searchParams.append("disable_auto_auth", "1");

    return res.send(authUrl.toString());
  } catch (error: any) {
    console.error("Error starting TikTok OAuth:", error);
    return res.status(500).json({ error: "Failed to initiate TikTok login" });
  }
};

export const handleTikTokCallback = async (
  req: Request,
  res: ExpressResponse
) => {
  const { code, state, error, error_description } = req.query;

  console.log({ code });
  console.log({ state });
  console.log({ error });
  console.log({ error_description });

  if (error) {
    console.error("TikTok OAuth error:", error, error_description);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent(
        error_description as string
      )}`
    );
  }

  if (!code || !state) {
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent(
        "Missing required parameters"
      )}`
    );
  }

  try {
    const stateData = await redisService.get(`tiktok:oauth:${state}`);

    if (!stateData) {
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "Authentication session expired or invalid"
        )}`
      );
    }

    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      await redisService.delete(`tiktok:oauth:${state}`);
      return res.redirect(
        `${
          process.env.FRONTEND_URL
        }/dashboard/accounts?error=${encodeURIComponent(
          "Authentication link expired"
        )}`
      );
    }

    const { userId, organizationId, currentTeamId } = stateData;

    const tokenData = await exchangeCodeForTokens(code as string);
    console.log({ tokenData });
    await createSocialAccount(userId, tokenData, organizationId, currentTeamId);

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/accounts?success=true`
    );
  } catch (err: any) {
    console.error("TikTok callback processing error:", err);
    return res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?error=${encodeURIComponent(
        "TikTok account linking failed"
      )}`
    );
  }
};

export const postToTikTok = async (req: Request, res: ExpressResponse) => {
  const { user } = req as any;

  try {
    const { media, description } = req.body;
    const { accountId } = req.params;

    const result = await post(accountId, media, description, user.id);
    res.status(200).json(result);
  } catch (error: any) {
    console.error("Error posting to TikTok:", error);
    res.status(500).json({ error: error.message });
  }
};
