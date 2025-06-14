import { Request, Response as ExpressResponse } from "express";
import redisService from "../../utils/redisClient";
import { getAuthorizationUrl } from "../../services/platforms/meta.service";
import axios from "axios";
import * as metaService from "../../services/platforms/meta.service";

export const startDirectMetaOAuth = async (
  req: Request,
  res: ExpressResponse
) => {
  const { id: userId, organizationId, currentTeamId } = (req as any).user!;
  const state = `${userId}:${Date.now()}`;

  await redisService.set(
    `meta:state:${state}`,
    JSON.stringify({ userId, organizationId, currentTeamId }),
    600
  );

  const redirectUri = getAuthorizationUrl(state, "instagram");

  res.send(redirectUri);
};

export const handleMetaCallback = async (
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

  const stored = await redisService.get(`meta:state:${state as string}`);
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
        redirect_uri: process.env.META_REDIRECT_URI!,
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

      await metaService.saveOrUpdateMetaAccount(fbAccountPayload);

      // If Page has connected IG Business Account
      if (pageData.instagram_business_account && !connectedIG) {
        const igId = pageData.instagram_business_account.id;
        const igProfileRes = await axios.get(
          `https://graph.facebook.com/v19.0/${igId}?fields=username,profile_picture_url,followers_count&access_token=${userAccessToken}`
        );
        const igProfile = igProfileRes.data;

        const igPayload = {
          platform: "instagram" as "facebook" | "instagram",
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
            fbPageId: pageId,
            fbPageName: pageData.name,
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

        await metaService.saveOrUpdateMetaAccount(igPayload);
        connectedIG = true;
      }
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
