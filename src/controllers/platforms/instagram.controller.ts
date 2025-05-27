import { Request, Response as ExpressResponse } from "express";
import * as instagramService from "../../services/platforms/instagram.service";
import {
  saveOrUpdateMetaAccount,
  getAuthorizationUrl,
} from "../../services/platforms/meta.service";
import redisService from "../../utils/redisClient";
import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

export const startDirectInstagramOAuth = async (
  req: Request,
  res: ExpressResponse
) => {
  const { id: userId, organizationId, currentTeamId } = (req as any).user!;
  const state = `${userId}:${organizationId}:${currentTeamId}:${Date.now()}`;

  await redisService.set(
    `instagram:state:${state}`,
    JSON.stringify({ userId, organizationId, currentTeamId }),
    600
  );

  const redirectUri = getAuthorizationUrl(state, "instagram");

  res.send(redirectUri);
};

export const handleInstagramCallback = async (
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

  const stored = await redisService.get(`instagram:state:${state as string}`);
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
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
        code: code as string,
      })
    );

    const userAccessToken = tokenRes.data.access_token;
    const tokenExpiry = tokenRes.data.expires_in
      ? Date.now() + tokenRes.data.expires_in * 1000
      : null;

    // 2. Fetch pages
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`
    );
    const pages = pagesRes.data.data;
    if (!pages || pages.length === 0) {
      throw new Error("No Facebook Pages found for this user.");
    }

    // 3. Find page linked to Instagram Business account
    let igBusinessAccount = null;
    let fbPage = null;
    for (const page of pages) {
      const pageRes = await axios.get(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account,name&access_token=${userAccessToken}`
      );
      if (pageRes.data.instagram_business_account) {
        igBusinessAccount = pageRes.data.instagram_business_account;
        fbPage = pageRes.data;
        break;
      }
    }

    if (!igBusinessAccount) {
      throw new Error("No connected Instagram Business Account found.");
    }

    // 4. Get IG Profile info
    const igId = igBusinessAccount.id;
    const igProfileRes = await axios.get(
      `https://graph.facebook.com/v19.0/${igId}?fields=username,profile_picture_url,followers_count&access_token=${userAccessToken}`
    );
    const igProfile = igProfileRes.data;

    // 5. Compose payload
    const accountPayload = {
      platform: "instagram" as "facebook" | "instagram",
      accountType: "business",
      accountName: igProfile.username,
      accountId: igId,
      platformAccountId: igId,
      accessToken: userAccessToken,
      refreshToken: null,
      tokenExpiry,
      lastRefreshed: new Date(),
      status: "active",
      userId,
      organizationId,
      currentTeamId,
      metadata: {
        profileUrl: `https://instagram.com/${igProfile.username}`,
        profileImageUrl: igProfile.profile_picture_url,
        followerCount: igProfile.followers_count,
        fbPageId: fbPage.id,
        fbPageName: fbPage.name,
        lastChecked: new Date(),
      },
      permissions: {
        canPost: true,
        canSchedule: true,
        canAnalyze: true,
      },
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    // 6. Save via service
    await saveOrUpdateMetaAccount(accountPayload);

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

export const post = async (req: Request, res: ExpressResponse) => {
  try {
    const { accountId } = req.params;
    const { caption, media } = req.body.data;
    const userId = (req as any).user?.id;

    if (!accountId) {
      return res.status(400).json({
        status: "error",
        message: "Account ID is required",
      });
    }

    if (!caption && (!media || media.length === 0)) {
      return res.status(400).json({
        status: "error",
        message: "Post content or media is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({
      _id: new ObjectId(accountId),
    });

    if (!account) {
      return res.status(404).json({
        status: "error",
        message: "Instagram account not found",
      });
    }

    if (account.userId.toString() !== userId) {
      return res.status(403).json({
        status: "error",
        message: "Unauthorized to post to this account",
      });
    }

    const result = await instagramService.postContent(
      accountId,
      caption,
      media
    );

    return res.status(200).json({
      status: "success",
      message: "Successfully posted to Instagram",
      data: result,
    });
  } catch (error: any) {
    console.error("Error posting to Instagram:", error);
    return res.status(500).json({
      status: "error",
      message: error.message ?? "An unexpected error occurred",
    });
  }
};

export const postToInstagram = async ({
  req,
  res,
  postData,
}: {
  req?: Request;
  res?: ExpressResponse;
  postData?: any;
}): Promise<any> => {
  try {
    const { accountId, content, mediaUrls } = postData ?? req?.body?.data ?? {};
    const userId = postData?.userId ?? (req as any)?.user?.id;

    if (!accountId || !userId) {
      const message = !accountId
        ? "Account ID is required"
        : "Authentication required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    if (!content && (!mediaUrls || mediaUrls.length === 0)) {
      const message = "Post content or media is required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    const result = await instagramService.postContent(
      accountId,
      content,
      mediaUrls
    );

    if (res) {
      return res.status(200).json({
        status: "success",
        message: "Successfully posted to Instagram",
        data: result.postId,
      });
    }

    return { success: true, postId: result.postId };
  } catch (error: any) {
    console.error("Error posting to Instagram:", error);
    if (res) {
      res.status(500).json({
        status: "error",
        message: error.message ?? "An unexpected error occurred",
      });
    }
    return { success: false, error: error.message };
  }
};
