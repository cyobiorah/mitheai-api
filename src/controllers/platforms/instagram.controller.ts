import { Request, Response } from "express";
import * as instagramService from "../../services/platforms/instagram.service";
import redisService from "../../utils/redisClient";
import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

export const startDirectInstagramOAuth = async (
  req: Request,
  res: Response
) => {
  console.log("instagram connection started");
  const { id: userId, organizationId, currentTeamId } = (req as any).user!;
  const state = `${userId}:${organizationId}:${currentTeamId}:${Date.now()}`;

  await redisService.set(
    `instagram:state:${state}`,
    JSON.stringify({ userId, organizationId, currentTeamId }),
    600
  );

  const redirectUri = instagramService.getAuthorizationUrl(state);

  console.log({ redirectUri });
  res.send(redirectUri);
};

export const handleInstagramCallback = async (req: Request, res: Response) => {
  console.log("instagram callback started");
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).send("Missing code or state.");

  const stored = await redisService.get(`instagram:state:${state as string}`);
  if (!stored) return res.status(403).send("Invalid or expired state.");

  const { userId, organizationId, currentTeamId } = JSON.parse(stored);

  try {
    // 1. Exchange code for access token
    const tokenRes = await axios.post(
      "https://graph.facebook.com/v19.0/oauth/access_token",
      new URLSearchParams({
        client_id: process.env.INSTAGRAM_CLIENT_ID!,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
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
      platform: "instagram",
      accountType: "business",
      accountName: igProfile.username,
      accountId: igId,
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
    await instagramService.saveOrUpdateInstagramAccount(accountPayload);

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

export const post = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { caption, media } = req.body.data;
    const userId = (req as any).user?.id;

    console.log({ params: req.params });
    console.log({ body: req.body });

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
    console.log({ accountId });
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
