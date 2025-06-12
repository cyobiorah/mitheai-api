import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";
import { SocialAccount } from "../../schema/schema";
import { fetchCloudinaryFileBuffer } from "../../utils/cloudinary";
import { isTokenExpired } from "./twitter.service";

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
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );

  const userProfile = profileRes.data.data.user;
  const accountId = userProfile.open_id;

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
        username: userProfile.display_name,
        avatar: userProfile.avatar_url,
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
    accountName: userProfile.display_name,
    accountId: userProfile.open_id,
    platformAccountId: userProfile.open_id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    refreshExpiresIn: new Date(
      Date.now() + tokenData.refresh_expires_in * 1000
    ),
    tokenExpiry: new Date(Date.now() + tokenData.expires_in * 1000),
    lastRefreshed: new Date(),
    status: "active",
    userId: new ObjectId(userId),
    metadata: {
      username: userProfile.display_name,
      profileImageUrl: userProfile.avatar_url,
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

export async function refreshTikTokTokenAndUpdateAccount(account: any) {
  const { socialaccounts } = await getCollections();

  if (!account?.refreshToken) {
    return {
      success: false,
      error: "No refresh token found for TikTok account.",
    };
  }

  const refreshRes = await refreshTikTokToken(account.refreshToken);

  if (!refreshRes.success) {
    return {
      success: false,
      error: refreshRes.error,
    };
  }

  const newTokenData = refreshRes.data;

  const updatedFields = {
    accountId: newTokenData.open_id,
    accessToken: newTokenData.access_token,
    refreshToken: newTokenData.refresh_token,
    tokenExpiry: new Date(Date.now() + newTokenData.expires_in * 1000),
    refreshExpiresIn: new Date(
      Date.now() + newTokenData.refresh_expires_in * 1000
    ),
    lastRefreshed: new Date(),
    updatedAt: new Date(),
  };

  await socialaccounts.updateOne({ _id: account._id }, { $set: updatedFields });

  return {
    success: true,
    updated: updatedFields,
  };
}

export async function refreshTikTokToken(refreshToken: string) {
  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error: any) {
    console.error(
      "TikTok token refresh error:",
      error.response?.data ?? error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function revokeAndDeleteAccount(account: any) {
  const { socialaccounts } = await getCollections();

  try {
    const revokeRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/revoke/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        token: account.accessToken,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (revokeRes.status === 200 && revokeRes.statusText === "OK") {
      await socialaccounts.deleteOne({ _id: account._id });
    }

    return {
      success: true,
      data: null,
    };
  } catch (error: any) {
    console.error(
      "TikTok revoke error:",
      error.response?.data ?? error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function post({
  postData,
  mediaFiles,
}: {
  postData: any;
  mediaFiles: string[];
}) {
  const {
    accountId,
    userId,
    content: description,
    tiktokAccountOptions,
  } = postData;
  const { socialaccounts, socialposts } = await getCollections();

  const account = await socialaccounts.findOne({
    accountId,
    userId: new ObjectId(userId),
  });

  if (!account)
    throw new Error("TikTok account not found for user na here ooo");

  const fileBuffer = await Promise.all(
    mediaFiles.map(async (file: string) => {
      const publicId = file;
      const { buffer, mimetype } = await fetchCloudinaryFileBuffer(
        `skedlii/${publicId}`,
        "video"
      );

      if (!buffer || !mimetype) {
        throw new Error(
          `Invalid Cloudinary asset or missing content-type for ref: ${file}`
        );
      }

      return {
        originalname: file,
        buffer,
        mimetype,
      };
    })
  );

  try {
    const publishId = await initAndUploadDirectTikTok(
      account.accessToken,
      fileBuffer[0],
      description,
      tiktokAccountOptions
    );

    await socialposts.insertOne({
      type: "social_post",
      content: description,
      platform: "tiktok",
      platformPostId: publishId,
      status: "posted",
      postedAt: new Date(),
      userId: new ObjectId(userId),
      metadata: {
        videoUrl: "",
        socialPost: {
          platform: "tiktok",
          accountId: account.accountId,
          username: account.metadata?.username,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true, postId: publishId };
  } catch (error: any) {
    console.error("TikTok post error:", error?.response?.data ?? error.message);
    return {
      success: false,
      error: error.message ?? "Unknown TikTok post error",
    };
  }
}

export async function getCreatorInfo(account: any) {
  let refreshRes;
  if (isTokenExpired(account.accessToken)) {
    refreshRes = await refreshTikTokTokenAndUpdateAccount(account);
    if (!refreshRes.success) {
      return {
        success: false,
        error: refreshRes.error,
      };
    }
  }
  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshRes?.updated?.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.error("TikTok creator_info query failed:", err.message);
    return null;
  }
}

async function initAndUploadDirectTikTok(
  accessToken: string,
  file: {
    buffer: Buffer;
    mimetype: string;
  },
  caption: string,
  tiktokAccountOptions: any
): Promise<string> {
  if (!file?.buffer || file.buffer.length === 0)
    throw new Error("Invalid video file buffer");

  const initPayload = {
    post_info: {
      title:
        caption?.slice(0, 100).replace(/[^\w\s]/gi, "") || "Posted via Skedlii",
      privacy_level: tiktokAccountOptions?.privacy ?? "SELF_ONLY",
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: file.buffer.length,
      chunk_size: file.buffer.length,
      total_chunk_count: 1,
    },
  };

  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(initPayload),
    }
  );

  const data = await response.json();
  if (data?.error?.code !== "ok") {
    throw new Error("TikTok init failed: " + data.error.message);
  }

  const { upload_url, publish_id } = data.data;
  if (!upload_url || !publish_id)
    throw new Error("TikTok init: Missing upload_url or publish_id");

  await axios.put(upload_url, file.buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${file.buffer.length - 1}/${
        file.buffer.length
      }`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 15_000,
  });

  return publish_id;
}

async function commitDirectTikTokUpload(
  accessToken: string,
  publishId: string,
  caption: string
) {
  try {
    const res = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/commit/",
      {
        publish_id: publishId,
        text: caption,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    return res;
  } catch (err: any) {
    console.error("Commit error:", err?.response?.data ?? err.message);
    throw new Error(
      "TikTok commit failed: " +
        (err?.response?.data?.error?.message ?? err.message)
    );
  }
}
