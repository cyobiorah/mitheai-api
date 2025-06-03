import { getCollections } from "../config/db";
import * as twitterService from "../services/platforms/twitter.service";
import * as threadsService from "../services/platforms/threads.service";
import * as linkedinService from "../services/platforms/linkedin.service";
import * as instagramService from "../services/platforms/instagram.service";
import { ObjectId } from "mongodb";
// import other platform services as needed

export class SocialPostWorker {
  static async processScheduledPosts() {
    const now = new Date();
    const { scheduledposts, socialposts, socialaccounts } =
      await getCollections();

    const filter = {
      status: { $in: ["scheduled"] },
      scheduledFor: { $lte: now },
    };
    const postsCursor = scheduledposts.find(filter);

    for await (const post of postsCursor) {
      try {
        await scheduledposts.updateOne(
          { _id: post._id },
          { $set: { status: "processing", updatedAt: new Date() } }
        );

        let allSuccessful = true;
        let allFailed = true;

        for (const platform of post.platforms) {
          try {
            const account = await socialaccounts.findOne({
              accountId: platform.accountId,
            });

            if (!account) {
              throw new Error(`Account not found: ${platform.accountId}`);
            }

            let publishResult: any;
            switch (account.platform) {
              case "twitter": {
                const contentItem = {
                  id: post._id?.toString(),
                  type: "social_post",
                  content: post.content,
                  mediaUrls: post.mediaUrls ?? [],
                  metadata: {
                    source: "scheduled_post",
                    language: "en",
                    tags: post.tags ?? [],
                    customFields: post.customFields ?? {},
                    socialPost: {
                      platform: account.platform,
                      scheduledTime: post.scheduledFor,
                      accountId: platform.accountId,
                    },
                  },
                  status: "pending",
                  teamId: post.teamId ?? null,
                  organizationId: post.organizationId ?? null,
                  createdBy: post.createdBy,
                  createdAt: post.createdAt,
                  updatedAt: new Date(),
                  mediaType: post.mediaType,
                  timezone: post.timezone,
                };

                publishResult = await twitterService.post(contentItem);
                break;
              }
              case "threads": {
                try {
                  publishResult = await threadsService.postToThreads({
                    accountId: account.accountId,
                    content: post.content,
                    mediaUrls: post.mediaUrls,
                  });
                } catch (tokenError: any) {
                  if (tokenError.code === "TOKEN_EXPIRED") {
                    const { socialaccounts } = await getCollections();
                    await socialaccounts.updateOne(
                      { _id: account._id },
                      {
                        $set: {
                          status: "expired",
                          "metadata.requiresReauth": true,
                          "metadata.lastError": tokenError.message,
                          "metadata.lastErrorTime": new Date(),
                          updatedAt: new Date(),
                        },
                      }
                    );
                    throw new Error(
                      `Threads account token has expired and requires reconnection: ${tokenError.message}`
                    );
                  }
                  throw tokenError;
                }
                break;
              }
              case "linkedin": {
                try {
                  const result = await linkedinService.postContent(
                    account.accountId,
                    post.content
                  );
                  publishResult = {
                    id: result.id,
                  };
                } catch (tokenError: any) {
                  if (tokenError.code === "TOKEN_EXPIRED") {
                    const { socialaccounts } = await getCollections();
                    await socialaccounts.updateOne(
                      { _id: account._id },
                      {
                        $set: {
                          status: "expired",
                          "metadata.requiresReauth": true,
                          "metadata.lastError": tokenError.message,
                          "metadata.lastErrorTime": new Date(),
                          updatedAt: new Date(),
                        },
                      }
                    );
                    throw new Error(
                      `LinkedIn account token has expired and requires reconnection: ${tokenError.message}`
                    );
                  }
                  throw tokenError;
                }
                break;
              }
              case "instagram": {
                const contentItem = {
                  content: post.content,
                  media: post.mediaUrls ?? [],
                };
                try {
                  const result = await instagramService.postContent(
                    platform.accountId,
                    contentItem.content,
                    contentItem.media
                  );
                  publishResult = {
                    id: result.postId,
                  };
                } catch (tokenError: any) {
                  if (tokenError.code === "TOKEN_EXPIRED") {
                    const { socialaccounts } = await getCollections();
                    await socialaccounts.updateOne(
                      { _id: account._id },
                      {
                        $set: {
                          status: "expired",
                          "metadata.requiresReauth": true,
                          "metadata.lastError": tokenError.message,
                          "metadata.lastErrorTime": new Date(),
                          updatedAt: new Date(),
                        },
                      }
                    );
                    throw new Error(
                      `Instagram account token has expired and requires reconnection: ${tokenError.message}`
                    );
                  }
                  throw tokenError;
                }
                break;
              }
              default:
                throw new Error(`Unsupported platform: ${account.platform}`);
            }

            // Defensive: Ensure publishResult has id
            if (!publishResult?.id) {
              throw new Error("Publish result missing id");
            }

            // Update platform status
            platform.status = "published";
            platform.publishedAt = new Date();

            // Extract the post ID based on the platform's response format
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
                postUrl = `https://www.linkedin.com/feed/update/${postId}`;
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
            };

            delete insertDoc._id;

            await socialposts.insertOne(insertDoc);
          } catch (err: any) {
            platform.status = "retry";
            platform.errorMessage = err.message ?? "Failed to publish";
          }
        }

        await scheduledposts.updateOne(
          { _id: post._id },
          {
            $set: {
              platforms: post.platforms,
              updatedAt: new Date(),
            },
          }
        );
      } catch (err: any) {
        await scheduledposts.updateOne(
          { _id: post._id },
          {
            $set: {
              status: "retry",
              errorMessage: err.message ?? "Failed to process scheduled post",
              updatedAt: new Date(),
            },
          }
        );
      }
    }
  }
}
