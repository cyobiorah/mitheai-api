import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";
import { SocialAccount } from "../../schema/schema";
import { fetchCloudinaryFileBuffer } from "../../utils/cloudinary";

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

// export async function post({
//   postData,
//   mediaFiles,
// }: {
//   postData: any;
//   mediaFiles: Express.Multer.File[];
// }) {
//   console.log({ postData });
//   console.log({ mediaFiles });
//   const { accountId, userId, description } = postData;

//   const { socialaccounts, socialposts } = await getCollections();

//   const account = await socialaccounts.findOne({
//     accountId,
//     userId: new ObjectId(userId),
//   });

//   if (!account) throw new Error("TikTok account not found for user");

//   let publishRes;

//   try {
//     const uploadRes = await axios.post(
//       "https://open.tiktokapis.com/v2/video/upload/",
//       mediaFiles[0].buffer,
//       {
//         headers: {
//           Authorization: `Bearer ${account.accessToken}`,
//           "Content-Type": "video/mp4",
//         },
//       }
//     );

//     console.log({ uploadRes });

//     publishRes = await axios.post(
//       "https://open.tiktokapis.com/v2/video/publish/",
//       {
//         video_id: uploadRes.data.data.video_id,
//         text: description,
//       },
//       {
//         headers: { Authorization: `Bearer ${account.accessToken}` },
//       }
//     );
//   } catch (err: any) {
//     console.log({ err });
//   }

//   console.log({ publishRes });

//   if (!publishRes?.data.data.video_id) {
//     return {
//       success: false,
//       error: "Failed to publish TikTok post",
//     };
//   }

//   const postId = publishRes?.data.data.video_id;

//   try {
//     const postRecord = {
//       type: "social_post",
//       content: description,
//       platform: "tiktok",
//       platformPostId: publishRes?.data.data.video_id,
//       status: "posted",
//       postedAt: new Date(),
//       userId: new ObjectId(userId),
//       metadata: {
//         videoUrl: publishRes?.data.data.share_url,
//         socialPost: {
//           platform: "tiktok",
//           accountId: account.accountId,
//           username: account.metadata?.username,
//         },
//       },
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     };

//     await socialposts.insertOne(postRecord);
//   } catch (err: any) {
//     console.log({ err });
//   }

//   return {
//     success: true,
//     postId,
//   };
// }

// export async function post({
//   postData,
//   mediaFiles,
// }: {
//   postData: any;
//   mediaFiles: Express.Multer.File[];
// }) {
//   const { accountId, userId, description } = postData;
//   const { socialaccounts, socialposts } = await getCollections();

//   const account = await socialaccounts.findOne({
//     accountId,
//     userId: new ObjectId(userId),
//   });

//   if (!account) throw new Error("TikTok account not found for user");

//   try {
//     console.log("here");
//     const videoId = await uploadToTikTok(account.accessToken, mediaFiles[0]);
//     console.log({ videoId });
//     const publishRes = await publishToTikTok(
//       account.accessToken,
//       videoId,
//       description
//     );
//     console.log({ publishRes });

//     const postId = publishRes.data?.data?.video_id;

//     await socialposts.insertOne({
//       type: "social_post",
//       content: description,
//       platform: "tiktok",
//       platformPostId: postId,
//       status: "posted",
//       postedAt: new Date(),
//       userId: new ObjectId(userId),
//       metadata: {
//         videoUrl: publishRes.data?.data?.share_url,
//         socialPost: {
//           platform: "tiktok",
//           accountId: account.accountId,
//           username: account.metadata?.username,
//         },
//       },
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     });

//     return { success: true, postId };
//   } catch (error: any) {
//     console.error("TikTok post error:", error?.response?.data || error.message);
//     return {
//       success: false,
//       error: error.message || "Unknown TikTok post error",
//     };
//   }
// }

// async function uploadToTikTok(
//   accessToken: string,
//   file: Express.Multer.File
// ): Promise<string> {
//   // Step 1: Get Upload URL
//   const { data: uploadUrlResponse } = await axios.get(
//     "https://open.tiktokapis.com/v2/video/upload_url/",
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//       },
//     }
//   );

//   console.log({ uploadUrlResponse });

//   console.log(uploadUrlResponse.data.data);

//   const { upload_url, video_id } = uploadUrlResponse.data.data;
//   if (!upload_url || !video_id) {
//     throw new Error("Failed to obtain TikTok upload URL");
//   }

//   // Step 2: Upload video file using PUT
//   await axios.put(upload_url, file.buffer, {
//     headers: {
//       "Content-Type": "video/mp4",
//     },
//     maxContentLength: Infinity,
//     maxBodyLength: Infinity,
//   });

//   return video_id;
// }

// export async function uploadToTikTok(
//   accessToken: string,
//   file: Express.Multer.File
// ): Promise<string> {
//   const videoSize = Number(file.size);
//   console.log("TikTok Init Payload:", {
//     source_info: {
//       source: "FILE_UPLOAD",
//       video_size: videoSize,
//       chunk_size: videoSize,
//       total_chunk_count: 1,
//     },
//   });

//   const upload_payload = JSON.stringify({
//     source_info: {
//       source: "FILE_UPLOAD",
//       video_size: file.size,
//       chunk_size: file.size,
//       total_chunk_count: 1,
//     },
//   });

//   // Step 1: Get upload URL
//   const { data: res } = await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
//     upload_payload,
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   console.log("TikTok init response:", res);
//   console.log("TikTok init response data:", JSON.stringify(res.data, null, 2));

//   const payload = res.data;
//   if (!payload?.data) {
//     console.error("TikTok init returned invalid structure:", payload);
//     throw new Error("TikTok init: Missing data field");
//   }

//   const { upload_url, publish_id } = payload.data;
//   if (!upload_url || !publish_id) {
//     console.error(
//       "TikTok init response missing expected fields:",
//       payload.data
//     );
//     throw new Error("Invalid upload URL or publish_id");
//   }

//   // Step 2: Validate file
//   if (!file.buffer || file.buffer.length === 0)
//     throw new Error("Invalid video file buffer");

//   // Step 3: Upload via PUT
//   await axios.put(upload_url, file.buffer, {
//     headers: {
//       "Content-Type": "video/mp4",
//     },
//     maxBodyLength: Infinity,
//     maxContentLength: Infinity,
//   });

//   return publish_id;
// }

// export async function uploadToTikTok(
//   accessToken: string,
//   file: Express.Multer.File
// ): Promise<string> {
//   if (!file?.buffer || file.buffer.length === 0)
//     throw new Error("Invalid video file buffer");

//   const payload = JSON.stringify({
//     source_info: {
//       source: "FILE_UPLOAD",
//       video_size: file.size,
//       chunk_size: file.size,
//       total_chunk_count: 1,
//     },
//   });

//   const { data } = await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
//     payload,
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   console.log("TikTok init response data:", JSON.stringify(data, null, 2));

//   if (!data?.data) {
//     console.error("TikTok init returned invalid structure:", data);
//     throw new Error("TikTok init: Missing data field");
//   }

//   const { upload_url, publish_id } = data.data;
//   if (!upload_url || !publish_id) {
//     console.error("TikTok init response missing expected fields:", data.data);
//     throw new Error("Invalid upload URL or publish_id");
//   }

//   await axios.put(upload_url, file.buffer, {
//     headers: {
//       "Content-Type": "video/mp4",
//       "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
//     },
//     maxBodyLength: Infinity,
//     maxContentLength: Infinity,
//   });

//   return publish_id;
// }

// async function publishToTikTok(
//   accessToken: string,
//   publishId: string,
//   description: string
// ) {
//   const { data } = await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/inbox/video/commit/",
//     {
//       publish_id: publishId,
//       text: description,
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   return data;
// }

// async function publishToTikTok(
//   accessToken: string,
//   publishId: string,
//   description: string
// ) {
//   return await axios.post(
//     "https://open.tiktokapis.com/v2/video/publish/",
//     {
//       publish_id: publishId,
//       text: description,
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//       },
//     }
//   );
// }

// export async function post({
//   postData,
//   mediaFiles,
// }: {
//   postData: any;
//   mediaFiles: Express.Multer.File[];
// }) {
//   const { accountId, userId, description } = postData;
//   const { socialaccounts, socialposts } = await getCollections();

//   const account = await socialaccounts.findOne({
//     accountId,
//     userId: new ObjectId(userId),
//   });

//   if (!account) throw new Error("TikTok account not found for user");

//   try {
//     const file = mediaFiles[0];
//     const publishId = await initAndUploadToTikTok(account.accessToken, file);
//     const commitRes = await commitTikTokUpload(
//       account.accessToken,
//       publishId,
//       description
//     );

//     const { video_id, share_url } = commitRes.data ?? {};

//     await socialposts.insertOne({
//       type: "social_post",
//       content: description,
//       platform: "tiktok",
//       platformPostId: video_id,
//       status: "posted",
//       postedAt: new Date(),
//       userId: new ObjectId(userId),
//       metadata: {
//         videoUrl: share_url,
//         socialPost: {
//           platform: "tiktok",
//           accountId: account.accountId,
//           username: account.metadata?.username,
//         },
//       },
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     });

//     return { success: true, postId: video_id };
//   } catch (error: any) {
//     console.error("TikTok post error:", error?.response?.data || error.message);
//     return {
//       success: false,
//       error: error.message || "Unknown TikTok post error",
//     };
//   }
// }

// async function initAndUploadToTikTok(
//   accessToken: string,
//   file: Express.Multer.File
// ): Promise<string> {
//   if (!file?.buffer || file.buffer.length === 0)
//     throw new Error("Invalid video file buffer");

//   const initPayload = {
//     source_info: {
//       source: "FILE_UPLOAD",
//       video_size: file.size,
//       chunk_size: file.size,
//       total_chunk_count: 1,
//     },
//   };

//   const { data } = await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
//     JSON.stringify(initPayload),
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   if (!data?.data?.upload_url || !data.data.publish_id) {
//     console.error("TikTok init failed:", data);
//     throw new Error("TikTok init: Missing upload_url or publish_id");
//   }

//   const { upload_url, publish_id } = data.data;

//   console.log("Uploading to:", upload_url);
//   console.log("Range: bytes 0-" + (file.size - 1) + "/" + file.size);

//   await axios.put(upload_url, file.buffer, {
//     headers: {
//       "Content-Type": "video/mp4",
//       "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
//     },
//     maxBodyLength: Infinity,
//     maxContentLength: Infinity,
//     timeout: 10_000,
//   });

//   return publish_id;
// }

// async function commitTikTokUpload(
//   accessToken: string,
//   publishId: string,
//   text: string
// ) {
//   return await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/inbox/video/commit/",
//     {
//       publish_id: publishId,
//       text,
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );
// }

export async function post({
  postData,
  mediaFiles,
}: {
  postData: any;
  mediaFiles: Express.Multer.File[];
}) {
  console.log({ mediaFiles });
  const { accountId, userId, content: description } = postData;
  const { socialaccounts, socialposts } = await getCollections();

  const account = await socialaccounts.findOne({
    accountId,
    userId: new ObjectId(userId),
  });

  if (!account) throw new Error("TikTok account not found for user");

  try {
    // const file = await fetchCloudinaryFileBuffer(mediaFiles[0]);
    const file = mediaFiles[0];
    console.log({ file });
    const publishId = await initAndUploadDirectTikTok(
      account.accessToken,
      file,
      description
    );
    const commitRes = await commitDirectTikTokUpload(
      account.accessToken,
      publishId,
      description
    );

    const { video_id, share_url } = commitRes.data ?? {};

    await socialposts.insertOne({
      type: "social_post",
      content: description,
      platform: "tiktok",
      platformPostId: video_id,
      status: "posted",
      postedAt: new Date(),
      userId: new ObjectId(userId),
      metadata: {
        videoUrl: share_url,
        socialPost: {
          platform: "tiktok",
          accountId: account.accountId,
          username: account.metadata?.username,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true, postId: video_id };
  } catch (error: any) {
    console.error("TikTok post error:", error?.response?.data || error.message);
    return {
      success: false,
      error: error.message || "Unknown TikTok post error",
    };
  }
}

// async function initAndUploadDirectTikTok(
//   accessToken: string,
//   file: Express.Multer.File,
//   caption: string
// ): Promise<string> {
//   if (!file?.buffer || file.buffer.length === 0)
//     throw new Error("Invalid video file buffer");

//   const initPayload = {
//     post_info: {
//       title: caption,
//       privacy_level: "PUBLIC", // or "PRIVATE", "FRIENDS"
//     },
//     source_info: {
//       source: "FILE_UPLOAD",
//       video_size: file.size,
//       chunk_size: file.size,
//       total_chunk_count: 1,
//     },
//   };

//   console.log("TikTok init payload:", initPayload);

//   const { data } = await axios.post(
//     "https://open.tiktokapis.com/v2/post/publish/video/init/",
//     initPayload,
//     {
//       headers: {
//         Authorization: `Bearer ${accessToken}`,
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   if (!data?.data?.upload_url || !data.data.publish_id) {
//     console.error("TikTok direct init failed:", data);
//     throw new Error("TikTok init: Missing upload_url or publish_id");
//   }

//   const { upload_url, publish_id } = data.data;

//   await axios.put(upload_url, file.buffer, {
//     headers: {
//       "Content-Type": "video/mp4",
//       "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
//     },
//     maxBodyLength: Infinity,
//     maxContentLength: Infinity,
//     timeout: 15_000,
//   });

//   return publish_id;
// }

async function initAndUploadDirectTikTok(
  accessToken: string,
  file: {
    buffer: Buffer;
    mimetype: string;
  },
  caption: string
): Promise<string> {
  console.log("here");
  try {
    console.log("where");
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );

    const tokenDebug = await response.json();
    console.log("TikTok token scopes:", JSON.stringify(tokenDebug, null, 2));
  } catch (err: any) {
    console.error("TikTok creator_info query failed:", err.message);
  }

  if (!file?.buffer || file.buffer.length === 0)
    throw new Error("Invalid video file buffer");

  const initPayload = {
    post_info: {
      title:
        caption?.slice(0, 100).replace(/[^\w\s]/gi, "") || "Posted via Skedlii",
      privacy_level: "SELF_ONLY",
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: file.buffer.length,
      chunk_size: file.buffer.length,
      total_chunk_count: 1,
    },
  };

  console.log("TikTok init payload:", JSON.stringify(initPayload, null, 2));

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
  return await axios.post(
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
}
