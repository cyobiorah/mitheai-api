import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";
import { SocialAccount } from "../../schema/schema";

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI!;

export async function exchangeCodeForTokens(code: string) {
  const response = await axios.post(
    "https://open.tiktokapis.com/v2/oauth/token/",
    new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: TIKTOK_REDIRECT_URI,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return response.data;
}

export async function createSocialAccount(
  userId: string,
  tokenData: any,
  organizationId?: string,
  teamId?: string
): Promise<any> {
  const { socialaccounts } = await getCollections();

  const profileRes = await axios.get(
    "https://open.tiktokapis.com/v2/user/info/",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const profile = profileRes.data.data;
  const accountId = profile.open_id;

  const existingAccount = await socialaccounts.findOne({
    platform: "tiktok",
    accountId,
  });

  if (existingAccount && existingAccount.userId.toString() !== userId) {
    const error: any = new Error(
      "This TikTok account is already connected to another user."
    );
    error.code = "account_already_connected_to_other_user";
    error.details = {
      existingAccountId: existingAccount._id,
      connectedUserId: existingAccount.userId,
      organizationId: existingAccount.organizationId,
      teamId: existingAccount.teamId,
      connectionDate: existingAccount.createdAt,
    };
    throw error;
  }

  const userExistingAccount = await socialaccounts.findOne({
    platform: "tiktok",
    accountId,
    userId: new ObjectId(userId),
  });

  if (userExistingAccount) {
    const updatedAccount = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
      lastRefreshed: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...userExistingAccount.metadata,
        username: profile.username,
        avatar: profile.avatar_url,
        bio: profile.bio_description,
      },
      status: "active",
    };

    await socialaccounts.updateOne(
      { _id: userExistingAccount._id },
      { $set: updatedAccount }
    );

    return {
      _id: userExistingAccount._id,
      updated: true,
    };
  }

  const socialAccount: SocialAccount = {
    platform: "tiktok",
    accountType: organizationId ? "business" : "personal",
    accountName: profile.display_name,
    accountId: profile.open_id,
    platformAccountId: profile.open_id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
    lastRefreshed: new Date(),
    status: "active",
    userId: new ObjectId(userId),
    metadata: {
      username: profile.username,
      profileImageUrl: profile.avatar_url,
      bio: profile.bio_description,
    },
    permissions: {
      canPost: true,
      canSchedule: true,
      canAnalyze: false,
    },
    connectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (organizationId)
    socialAccount.organizationId = new ObjectId(organizationId);
  if (teamId) socialAccount.teamId = new ObjectId(teamId);

  const createdAccount = await socialaccounts.insertOne(socialAccount);
  return createdAccount;
}

export async function post(
  accountId: string,
  media: Buffer,
  description: string,
  userId: string
) {
  const { socialaccounts, socialposts } = await getCollections();

  const account = await socialaccounts.findOne({
    _id: new ObjectId(accountId),
    userId: new ObjectId(userId),
  });

  if (!account) throw new Error("TikTok account not found for user");

  const uploadRes = await axios.post(
    "https://open.tiktokapis.com/v2/video/upload/",
    media,
    {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "video/mp4",
      },
    }
  );

  const publishRes = await axios.post(
    "https://open.tiktokapis.com/v2/video/publish/",
    {
      video_id: uploadRes.data.data.video_id,
      text: description,
    },
    {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    }
  );

  const postRecord = {
    type: "social_post",
    content: description,
    platform: "tiktok",
    platformPostId: publishRes.data.data.video_id,
    status: "posted",
    postedAt: new Date(),
    userId: new ObjectId(userId),
    metadata: {
      videoUrl: publishRes.data.data.share_url,
      socialPost: {
        platform: "tiktok",
        accountId: account.accountId,
        username: account.metadata?.username,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await socialposts.insertOne(postRecord);

  return postRecord;
}
