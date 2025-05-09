import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID!;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI!;

interface InstagramAccountPayload {
  platform: string;
  accountType: string;
  accountName: string;
  accountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: number | null;
  lastRefreshed: Date;
  status: string;
  userId: string;
  organizationId: string | null;
  currentTeamId: string | null;
  metadata: {
    profileUrl: string;
    profileImageUrl: string;
    followerCount: number;
    fbPageId: string;
    fbPageName: string;
    lastChecked: Date;
  };
  permissions: {
    canPost: boolean;
    canSchedule: boolean;
    canAnalyze: boolean;
  };
  connectedAt: Date;
  updatedAt: Date;
}

export const getAuthorizationUrl = (state: string) => {
  const base = "https://www.facebook.com/v19.0/dialog/oauth";
  const params = new URLSearchParams({
    client_id: INSTAGRAM_CLIENT_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    scope:
      "pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement,business_management",
    response_type: "code",
    state,
  });
  return `${base}?${params.toString()}`;
};

export const saveOrUpdateInstagramAccount = async (
  payload: InstagramAccountPayload
) => {
  const { socialaccounts } = await getCollections();

  const existing = await socialaccounts.findOne({
    platform: "instagram",
    accountId: payload.accountId,
  });

  if (existing && existing.userId.toString() !== payload.userId) {
    throw new Error(
      "This Instagram account is already connected by another user."
    );
  }

  const dbPayload = {
    ...payload,
    userId: new ObjectId(payload.userId),
    organizationId: payload.organizationId
      ? new ObjectId(payload.organizationId)
      : null,
    currentTeamId: payload.currentTeamId
      ? new ObjectId(payload.currentTeamId)
      : null,
  };

  if (existing) {
    await socialaccounts.updateOne(
      { _id: existing._id },
      { $set: { ...dbPayload, updatedAt: new Date() } }
    );
  } else {
    await socialaccounts.insertOne({
      ...dbPayload,
      createdAt: new Date(),
    });
  }
};

export const saveSocialPost = async (postData: any) => {
  const { socialposts } = await getCollections();

  await socialposts.insertOne({
    ...postData,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

export const postContent = async (
  accountId: string,
  caption: string,
  media: { url: string; type?: string }[]
): Promise<{ success: boolean; postId: string }> => {
  const { socialaccounts, socialposts } = await getCollections();

  const account = await socialaccounts.findOne({
    _id: new ObjectId(accountId),
  });
  if (!account) throw new Error("Instagram account not found");
  if (!account.accessToken) throw new Error("Missing access token");

  const igUserId = account.accountId;
  const accessToken = account.accessToken;

  let postId: string;

  if (media.length === 1) {
    // Single image
    const mediaRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      new URLSearchParams({
        image_url: media[0].url,
        caption: caption || "",
        access_token: accessToken,
      })
    );

    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      new URLSearchParams({
        creation_id: mediaRes.data.id,
        access_token: accessToken,
      })
    );

    postId = publishRes.data.id;
  } else {
    // Carousel
    const containerIds = [];

    for (const item of media) {
      const res = await axios.post(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        new URLSearchParams({
          image_url: item.url,
          is_carousel_item: "true",
          access_token: accessToken,
        })
      );
      containerIds.push(res.data.id);
    }

    const carouselRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      new URLSearchParams({
        media_type: "CAROUSEL",
        children: containerIds.join(","),
        caption: caption || "",
        access_token: accessToken,
      })
    );

    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      new URLSearchParams({
        creation_id: carouselRes.data.id,
        access_token: accessToken,
      })
    );

    postId = publishRes.data.id;
  }

  // Save to DB
  const now = new Date();
  await socialposts.insertOne({
    userId: account.userId,
    teamId: account.currentTeamId ? new ObjectId(account.currentTeamId) : null,
    organizationId: account.organizationId
      ? new ObjectId(account.organizationId)
      : null,
    socialAccountId: account._id,
    platform: "instagram",
    content: caption,
    mediaType: "IMAGE", // You can improve this to detect VIDEO
    postId,
    status: "published",
    publishedDate: now,
    createdAt: now,
    updatedAt: now,
    metadata: {
      platform: "instagram",
      platformAccountId: null,
      accountId: igUserId,
      accountName: account.accountName,
      accountType: account.accountType,
      profileUrl: account.metadata?.profileUrl,
      profileImageUrl: account.metadata?.profileImageUrl,
    },
  });

  return { success: true, postId };
};
