import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID!;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI!;

export interface MetaAccountPayload {
  platform: "instagram" | "facebook";
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

export const getAuthorizationUrl = (state: string) => {
  const base = "https://www.facebook.com/v19.0/dialog/oauth";
  const params = new URLSearchParams({
    client_id: INSTAGRAM_CLIENT_ID,
    redirect_uri: META_REDIRECT_URI,
    scope:
      "pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement,pages_manage_posts,business_management",
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
