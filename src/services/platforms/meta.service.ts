import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

const META_CLIENT_ID = process.env.META_CLIENT_ID!;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI!;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI!;
const THREADS_REDIRECT_URI = process.env.THREADS_REDIRECT_URI!;

export interface MetaAccountPayload {
  platform: "instagram" | "facebook" | "threads";
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
  metadata: Record<string, any>;
  permissions: {
    canPost: boolean;
    canSchedule: boolean;
    canAnalyze: boolean;
  };
  connectedAt: Date;
  updatedAt: Date;
}

export const getAuthorizationUrl = (state: string, platform: string) => {
  let redirectUri;
  switch (platform) {
    case "instagram":
      redirectUri = INSTAGRAM_REDIRECT_URI;
      break;
    case "facebook":
      redirectUri = FACEBOOK_REDIRECT_URI;
      break;
    case "threads":
      redirectUri = THREADS_REDIRECT_URI;
      break;
    default:
      redirectUri = INSTAGRAM_REDIRECT_URI;
  }
  const base = "https://www.facebook.com/v22.0/dialog/oauth";
  const params = new URLSearchParams({
    client_id: META_CLIENT_ID,
    redirect_uri: redirectUri,
    scope:
      "pages_show_list,instagram_basic,instagram_content_publish,pages_manage_posts",
    response_type: "code",
    state,
  });
  return `${base}?${params.toString()}`;
};

export const saveOrUpdateMetaAccount = async (payload: MetaAccountPayload) => {
  const { socialaccounts } = await getCollections();

  const existing = await socialaccounts.findOne({
    platform: payload.platform,
    accountId: payload.accountId,
  });

  if (existing && existing.userId.toString() !== payload.userId) {
    throw new Error(
      `This ${payload.platform} account is already connected by another user.`
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
