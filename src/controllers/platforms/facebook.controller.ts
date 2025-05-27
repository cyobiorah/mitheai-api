import { Request, Response as ExpressResponse } from "express";
import { postContent } from "../../services/platforms/facebook.service";
import { getCollections } from "../../config/db";
import redisService from "../../utils/redisClient";
import {
  getAuthorizationUrl,
  saveOrUpdateMetaAccount,
} from "../../services/platforms/meta.service";
import axios from "axios";

export const startDirectFacebookOAuth = async (
  req: Request,
  res: ExpressResponse
) => {
  const { id: userId, organizationId, currentTeamId } = (req as any).user!;
  const state = `${userId}:${organizationId}:${currentTeamId}:${Date.now()}`;

  await redisService.set(
    `facebook:state:${state}`,
    JSON.stringify({ userId, organizationId, currentTeamId }),
    600
  );

  const redirectUri = getAuthorizationUrl(state, "facebook");

  res.send(redirectUri);
};

export const handleFacebookCallback = async (
  req: Request,
  res: ExpressResponse
) => {
  const { code, state } = req.query;

  if (!code || !state) {
    res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?status=failed&message=${encodeURIComponent(
        "Missing code or state"
      )}`
    );
    return;
  }

  const stored = await redisService.get(`facebook:state:${state as string}`);
  if (!stored) return res.status(403).send("Invalid or expired state.");

  const { userId, organizationId, currentTeamId } = JSON.parse(stored);

  try {
    // 1. Exchange code for access token
    const tokenRes = await axios.post(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      new URLSearchParams({
        client_id: process.env.META_CLIENT_ID!,
        client_secret: process.env.META_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: process.env.FACEBOOK_REDIRECT_URI!,
        code: code as string,
      })
    );

    const userAccessToken = tokenRes.data.access_token;
    const tokenExpiry = tokenRes.data.expires_in
      ? Date.now() + tokenRes.data.expires_in * 1000
      : null;

    // 2. Fetch Facebook Pages
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`
    );
    const pages = pagesRes.data.data;
    if (!pages || pages.length === 0) {
      throw new Error("No Facebook Pages found for this user.");
    }

    let connectedIG = false;

    for (const page of pages) {
      const pageId = page.id;

      // Fetch Page details
      const pageDetailsRes = await axios.get(
        `https://graph.facebook.com/v19.0/${pageId}?fields=name,instagram_business_account&access_token=${userAccessToken}`
      );
      const pageData = pageDetailsRes.data;

      // Always save Facebook Page account
      const fbAccountPayload = {
        platform: "facebook" as "facebook" | "instagram",
        accountType: "page",
        accountName: pageData.name,
        accountId: pageId,
        platformAccountId: pageId,
        accessToken: page.access_token, // This is the Page-level token
        refreshToken: null,
        tokenExpiry,
        lastRefreshed: new Date(),
        status: "active",
        userId,
        organizationId,
        currentTeamId,
        metadata: {
          profileUrl: `https://facebook.com/${pageId}`,
          profileImageUrl: null,
          followerCount: 0,
          fbPageId: pageId,
          fbPageName: pageData.name,
          lastChecked: new Date(),
        },
        permissions: {
          canPost: true,
          canSchedule: true,
          canAnalyze: false,
        },
        connectedAt: new Date(),
        updatedAt: new Date(),
      };

      await saveOrUpdateMetaAccount(fbAccountPayload);
    }

    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/accounts?status=success`
    );
  } catch (err: any) {
    console.error("Instagram callback error:", err);
    res.redirect(
      `${
        process.env.FRONTEND_URL
      }/dashboard/accounts?status=failed&message=${encodeURIComponent(
        err.message ?? "Unknown error"
      )}`
    );
  }
};

export const postToFacebook = async ({
  req,
  res,
  postData,
}: {
  req?: Request;
  res?: ExpressResponse;
  postData?: any;
}): Promise<any> => {
  try {
    const { accountId, content, mediaUrls, link } =
      postData ?? req?.body?.data ?? {};
    const userId = postData?.userId ?? (req as any)?.user?.id;

    if (!accountId || !userId) {
      const message = !accountId
        ? "Account ID is required"
        : "Authentication required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    if (!content && (!mediaUrls || mediaUrls.length === 0) && !link) {
      const message = "Post content, media, or link is required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({
      accountId,
    });

    if (!account || account.platform !== "facebook") {
      const message = "Facebook account not found or invalid";
      res?.status(404).json({ status: "error", message });
      return { success: false, error: message };
    }

    if (account.userId.toString() !== userId) {
      const message = "Unauthorized to post to this account";
      res?.status(403).json({ status: "error", message });
      return { success: false, error: message };
    }

    // Actual post
    const postId = await postContent(
      account.accountId,
      account.accessToken,
      content,
      link,
      mediaUrls
    );

    if (res) {
      return res.status(200).json({
        status: "success",
        message: "Successfully posted to Facebook",
        data: postId,
      });
    }

    return { success: true, postId };
  } catch (error: any) {
    console.error("Error posting to Facebook:", error);
    if (res) {
      res.status(500).json({
        status: "error",
        message: error.message ?? "An unexpected error occurred",
      });
    }
    return { success: false, error: error.message };
  }
};
