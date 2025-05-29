import { getCollections } from "../config/db";
import { ObjectId } from "mongodb";
import { post as postToTwitter } from "../services/platforms/twitter.service";
import { postContent as postToThreads } from "../services/platforms/threads.service";
import { postContent as postToLinkedin } from "../services/platforms/linkedin.service";
import { postContent as postToInstagram } from "../services/platforms/instagram.service";

interface PlatformDetails {
  scheduledPostId: string;
  platform: {
    platformName: "twitter" | "linkedin" | "instagram" | "threads";
    accountId: string;
  };
  userId: string;
  teamId?: string;
  organizationId?: string;
}

export const postToPlatform = async (job: PlatformDetails) => {
  console.log("🚀 ~ postToPlatform ~ job:", job);
  const { scheduledposts, socialaccounts, socialposts } =
    await getCollections();

  const post = await scheduledposts.findOne({
    _id: new ObjectId(job.scheduledPostId),
  });
  if (!post)
    return {
      success: false,
      error: "Scheduled post not found",
      errorType: "MISSING_POST",
    };

  const account = await socialaccounts.findOne({
    accountId: job.platform.accountId,
  });
  if (!account)
    return {
      success: false,
      error: "Social account not found",
      errorType: "MISSING_ACCOUNT",
    };

  try {
    let publishResult: any;

    switch (account.platform) {
      case "twitter":
        publishResult = await postToTwitter({
          id: post._id.toString(),
          type: "social_post",
          content: post.content,
          mediaUrls: post.mediaUrls ?? [],
          metadata: {
            source: "scheduled_post",
            tags: post.tags ?? [],
            customFields: post.customFields ?? {},
            socialPost: {
              platform: account.platform,
              scheduledTime: post.scheduledFor,
              accountId: job.platform.accountId,
            },
          },
          status: "pending",
          teamId: job.teamId ?? null,
          organizationId: job.organizationId ?? null,
          createdBy: job.userId,
          createdAt: post.createdAt,
          updatedAt: new Date(),
          mediaType: post.mediaType,
          timezone: post.timezone,
        });
        break;

      case "threads":
        publishResult = await postToThreads(
          account.accountId,
          post.content,
          (post.mediaType ?? "TEXT") as "TEXT" | "IMAGE" | "VIDEO",
          post.mediaUrls?.[0]
        );
        break;

      case "linkedin":
        publishResult = await postToLinkedin(account.accountId, post.content);
        break;

      case "instagram":
        publishResult = await postToInstagram(
          account.accountId,
          post.content,
          post.mediaUrls ?? []
        );
        break;

      default:
        throw new Error(`Unsupported platform: ${account.platform}`);
    }

    if (!publishResult?.id) {
      return {
        success: false,
        error: "Missing post ID in result",
        errorType: "SERVICE_ERROR",
      };
    }

    console.log({ publishResult });

    const postUrl =
      "url" in publishResult
        ? publishResult.url
        : `https://${account.platform}.com/status/${publishResult.id}`;

    // ✅ Update the scheduled post’s platform entry to mark as published
    await scheduledposts.updateOne(
      { _id: post._id, "platforms.accountId": job.platform.accountId },
      {
        $set: {
          "platforms.$.status": "published",
          "platforms.$.publishedAt": new Date(),
          updatedAt: new Date(),
        },
      }
    );

    const insertDoc = {
      ...publishResult,
      content: post.content,
      mediaType: post.mediaType,
      platform: account.platform,
      socialAccountId: account._id,
      postId: publishResult.id,
      postUrl,
      publishedDate: new Date(),
      status: "published",
      userId: post.createdBy,
      teamId: post.teamId ? new ObjectId(post.teamId) : undefined,
      organizationId: post.organizationId
        ? new ObjectId(post.organizationId)
        : undefined,
      scheduledPostId: post._id,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        source: "scheduled_post",
        accountName: account.accountName,
        platform: account.platform,
        platformAccountId: account.accountId,
      },
    };

    delete insertDoc._id;

    await socialposts.insertOne(insertDoc);

    console.log(
      `✅ Post successful: ${account.platform} → ${publishResult.id}`
    );

    return { success: true, id: publishResult.id, postUrl };
  } catch (err: any) {
    console.error(`🔥 Post failed [${account.platform}]: ${err.message}`);
    if (err.code === "TOKEN_EXPIRED") {
      await socialaccounts.updateOne(
        { _id: account._id },
        {
          $set: {
            status: "expired",
            "metadata.requiresReauth": true,
            "metadata.lastError": err.message,
            "metadata.lastErrorTime": new Date(),
            updatedAt: new Date(),
          },
        }
      );
      return {
        success: false,
        error: `Token expired: ${err.message}`,
        errorType: "TOKEN_EXPIRED",
      };
    }

    return {
      success: false,
      error: err.message ?? "Unhandled error",
      errorType: "SERVICE_ERROR",
    };
  }
};
