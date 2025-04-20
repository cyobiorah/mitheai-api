import { getCollections } from "../config/db";
import * as twitterService from "../services/platforms/twitter.service";
import * as threadsService from "../services/platforms/threads.service";
// import other platform services as needed

export class SocialPostWorker {
  static async processScheduledPosts() {
    const now = new Date();
    const { scheduledposts, socialposts, socialaccounts } =
      await getCollections();
    const postsCursor = scheduledposts.find({
      status: { $in: ["scheduled", "processing"] },
      scheduledFor: { $lte: now },
    });

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
              _id: platform.accountId,
            });
            if (!account)
              throw new Error(`Account not found: ${platform.accountId}`);

            let publishResult: any;
            switch (account.platform) {
              case "twitter": {
                // --- Construct ContentItem as in legacy codebase ---
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
                      // Add any additional fields as needed
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
              case "threads":
                console.log(
                  `Attempting to post to Threads with account ${account._id.toString()}`
                );

                try {
                  // Post the content directly - token refresh will happen inside postContent if needed
                  publishResult = await threadsService.postContent(
                    account._id.toString(),
                    post.content,
                    post.mediaType
                      ? (post.mediaType as "TEXT" | "IMAGE" | "VIDEO")
                      : "TEXT",
                    post.mediaUrls?.[0]
                  );
                } catch (tokenError: any) {
                  // If token is expired, mark the account as needing reauthorization
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
              // Add other platforms as needed
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

            await socialposts.insertOne({
              ...publishResult,
              platform: account.platform,
              socialAccountId: account._id,
              postId,
              postUrl,
              publishedDate: new Date(),
              status: "published",
              scheduledPostId: post._id,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            allFailed = false;
          } catch (err: any) {
            platform.status = "failed";
            platform.errorMessage = err.message || "Failed to publish";
            allSuccessful = false;
          }
        }

        await scheduledposts.updateOne(
          { _id: post._id },
          {
            $set: {
              status: allSuccessful
                ? "completed"
                : allFailed
                ? "failed"
                : "partial",
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
              status: "failed",
              errorMessage: err.message,
              updatedAt: new Date(),
            },
          }
        );
      }
    }
  }
}
