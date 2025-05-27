import axios from "axios";
import { getCollections } from "../../config/db";
import { ObjectId } from "mongodb";

export const postContent = async (
  pageId: string,
  pageAccessToken: string,
  message: string,
  link?: string,
  mediaUrls?: string[]
): Promise<{ success: boolean; postId: string }> => {
  const { socialposts, socialaccounts } = await getCollections();

  const account = await socialaccounts.findOne({
    accountId: pageId,
    platform: "facebook",
  });
  if (!account) throw new Error("Facebook page not found");

  const postPayload: Record<string, string> = {
    message,
    access_token: pageAccessToken,
  };

  if (link) {
    postPayload.link = link;
  }

  let postRes;
  let photoRes;

  if (mediaUrls && mediaUrls.length > 0) {
    photoRes = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/photos`,
      new URLSearchParams({
        url: mediaUrls[0], // only one at a time supported
        caption: message,
        access_token: pageAccessToken,
      })
    );
  } else {
    postRes = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      new URLSearchParams(postPayload)
    );
  }

  const postId = postRes?.data.id ?? photoRes?.data.id;
  const now = new Date();

  await socialposts.insertOne({
    userId: account.userId,
    teamId: account.currentTeamId ? new ObjectId(account.currentTeamId) : null,
    organizationId: account.organizationId
      ? new ObjectId(account.organizationId)
      : null,
    socialAccountId: account._id,
    platform: "facebook",
    content: message,
    mediaType: link ? "LINK" : "TEXT",
    mediaUrls: link ? [link] : mediaUrls,
    postId,
    status: "published",
    publishedDate: now,
    createdAt: now,
    updatedAt: now,
    metadata: {
      platform: "facebook",
      accountId: account.accountId,
      accountName: account.accountName,
      accountType: account.accountType,
      profileUrl: `https://facebook.com/${account.accountId}`,
      profileImageUrl: null, // You can later query profile image
    },
  });

  return { success: true, postId };
};
