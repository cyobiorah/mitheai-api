import { getCollections } from "../config/db";
import { ObjectId } from "mongodb";
import { post as postToTwitter } from "../services/platforms/twitter.service";
import { postToThreads } from "../services/platforms/threads.service";

import { postToInstagram } from "../controllers/platforms/instagram.controller";
import { postToLinkedIn } from "../services/platforms/linkedin.service";
import { fetchCloudinaryFileBuffer } from "../utils/cloudinary";

interface PlatformDetails {
  scheduledPostId: string;
  platform: {
    platformName: "twitter" | "linkedin" | "instagram" | "threads";
    accountId: string;
  };
  userId: string;
  teamId?: string;
  organizationId?: string;
  fileRefs?: string[];
}

export const postToPlatform = async (job: PlatformDetails) => {
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
      case "twitter": {
        const mediaFiles = await Promise.all(
          post.fileRefs.map(async (ref: string) => {
            // Reconstruct the full publicId or Cloudinary path if needed
            const publicId = `skedlii/${ref}`;
            const { buffer, mimetype } = await fetchCloudinaryFileBuffer(
              publicId
            );

            if (!buffer || !mimetype) {
              throw new Error(
                `Invalid Cloudinary asset or missing content-type for ref: ${ref}`
              );
            }

            return {
              originalname: ref,
              buffer,
              mimetype,
            };
          })
        );
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
          fileRefs: mediaFiles,
        });
        break;
      }

      case "threads": {
        const postData = {
          accountId: account.accountId,
          content: post.content,
          mediaUrls: post.mediaUrls,
          userId: job.userId,
        };
        publishResult = await postToThreads(postData);
        break;
      }

      case "linkedin": {
        const mediaFiles = await Promise.all(
          post.fileRefs.map(async (ref: string) => {
            // Reconstruct the full publicId or Cloudinary path if needed
            const publicId = `skedlii/${ref}`;
            const { buffer, mimetype } = await fetchCloudinaryFileBuffer(
              publicId
            );

            if (!buffer || !mimetype) {
              throw new Error(
                `Invalid Cloudinary asset or missing content-type for ref: ${ref}`
              );
            }

            return {
              originalname: ref,
              buffer,
              mimetype,
            };
          })
        );

        try {
          const result = await postToLinkedIn({
            postData: {
              accountId: account.accountId,
              accountName: account.accountName,
              accountType: account.accountType,
              content: post.content,
              mediaType: post.mediaType,
              platformAccountId: account.accountId,
              accessToken: account.accessToken,
              dimensions: post.dimensions,
              mediaUrls: post.mediaUrls,
              userId: job.userId,
            },
            mediaFiles,
          });
          if (!result.success) {
            return {
              success: false,
              error: result.error,
              errorType: "SERVICE_ERROR",
            };
          }

          publishResult = {
            id: result.postId,
          };
        } catch (err: any) {
          console.error("LinkedIn post error:", err);
          return {
            success: false,
            error: "Unexpected error posting to LinkedIn",
            errorType: "SERVICE_ERROR",
          };
        }
        break;
      }

      case "instagram": {
        const payload = {
          accountId: account.accountId,
          accountName: account.accountName,
          accountType: account.accountType,
          content: post.content,
          mediaType: post.mediaType,
          platformAccountId: account.accountId,
          accessToken: account.accessToken,
          dimensions: post.dimensions,
          mediaUrls: post.mediaUrls,
          userId: job.userId,
        };

        const result = await postToInstagram({ postData: payload });
        if (!result.success) {
          return {
            success: false,
            error: result.error,
            errorType: "SERVICE_ERROR",
          };
        }
        publishResult = {
          id: result.postId,
        };
        break;
      }

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

    let postId: string;
    let postUrl: string;

    if ("success" in publishResult) {
      // LinkedIn or Threads service format
      if (!publishResult.success) {
        throw new Error(
          publishResult.error ?? `Failed to post to ${account.platform}`
        );
      }
      postId = publishResult.id ?? `${account.platform}-${Date.now()}`;

      // Generate platform-specific URLs
      if (account.platform === "linkedin") {
        const visibleId = publishResult.id?.split(":").pop();
        postUrl = `https://www.linkedin.com/feed/update/${visibleId}`;
      } else if (account.platform === "threads") {
        postUrl = `https://threads.net/t/${postId}`;
      } else {
        postUrl = `https://${account.platform}.com/posts/${postId}`;
      }
    } else {
      // Twitter/other services format
      postId = publishResult.id;
      postUrl =
        "url" in publishResult
          ? publishResult.url
          : `https://${account.platform}.com/status/${postId}`;
    }

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
      postId,
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

    return { success: true, id: publishResult.id, postUrl };
  } catch (err: any) {
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
