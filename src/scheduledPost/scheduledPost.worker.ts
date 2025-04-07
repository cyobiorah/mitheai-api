import { RepositoryFactory } from "../repositories/repository.factory";
import { TwitterService } from "../platforms/twitter/twitter.service";
import { LinkedInService } from "../platforms/linkedin/linkedin.service";
import { ThreadsService } from "../platforms/threads/threads.service";
import { ContentItem } from "../types";

export class ScheduledPostWorker {
  static async processScheduledPosts() {
    try {
      console.log("Processing scheduled posts...");
      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();
      const socialPostRepository =
        await RepositoryFactory.createSocialPostRepository();
      const socialAccountRepository =
        await RepositoryFactory.createSocialAccountRepository();
      const twitterService = new TwitterService();
      const linkedinService = new LinkedInService();
      const threadsService = new ThreadsService();

      // Get all scheduled posts that are due for publishing
      const now = new Date();
      const postsToProcess = await scheduledPostRepository.find({
        status: "scheduled",
        scheduledFor: { $lte: now },
      });

      console.log(`Found ${postsToProcess.length} posts to process`);

      for (const post of postsToProcess) {
        try {
          // Update status to processing
          await scheduledPostRepository.update(post._id!.toString(), {
            status: "processing",
            updatedAt: new Date(),
          });

          // Process each platform
          for (const platform of post.platforms) {
            try {
              // Get the social account
              const account = await socialAccountRepository.findById(
                platform.accountId
              );

              if (!account) {
                throw new Error(`Account ${platform.accountId} not found`);
              }

              // Publish to the platform
              let postResult;

              switch (account.platform) {
                case "twitter": {
                  // Create ContentItem for Twitter
                  const twitterContentItem: ContentItem = {
                    id: post._id!.toString(),
                    type: "social_post",
                    content: post.content,
                    metadata: {
                      source: "scheduled_post",
                      language: "en",
                      tags: [],
                      customFields: {},
                      socialPost: {
                        platform: "twitter",
                        scheduledTime: post.scheduledFor,
                      },
                    },
                    status: "pending",
                    teamId: post.teamId ?? null,
                    organizationId: post.organizationId ?? null,
                    createdBy: post.createdBy,
                    createdAt: post.createdAt,
                    updatedAt: new Date(),
                  };
                  postResult = await twitterService.post(twitterContentItem);
                  break;
                }
                case "facebook":
                  // Call Facebook API
                  // postResult = await facebookService.post(account, post.content, post.mediaUrls);
                  postResult = {
                    id: "mock-facebook-id",
                    url: "https://facebook.com/posts/mock",
                  };
                  break;
                case "linkedin":
                  // Call LinkedIn API
                  postResult = await linkedinService.postToLinkedIn(
                    account._id.toString(),
                    post.content
                  );
                  break;
                case "threads":
                  // Call Threads API
                  postResult = await threadsService.postContent(
                    account._id.toString(),
                    post.content,
                    post.mediaType
                      ? (post.mediaType as "TEXT" | "IMAGE" | "VIDEO")
                      : "TEXT",
                    post.mediaUrls?.[0]
                  );
                  break;
                default:
                  throw new Error(`Unsupported platform: ${account.platform}`);
              }

              // Update platform status
              platform.status = "published";
              platform.publishedAt = new Date();

              // Extract the post ID based on the platform's response format
              let postId: string;
              let postUrl: string;

              if ("success" in postResult) {
                // LinkedIn or Threads service format
                if (!postResult.success) {
                  throw new Error(
                    postResult.error ?? `Failed to post to ${account.platform}`
                  );
                }
                postId =
                  postResult.postId ?? `${account.platform}-${Date.now()}`;

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
                postId = postResult.id;
                postUrl =
                  "url" in postResult
                    ? postResult.url
                    : `https://${account.platform}.com/status/${postId}`;
              }

              // Create a record in the social posts collection
              await socialPostRepository.createPost({
                content: post.content,
                mediaUrls: post.mediaUrls ?? [],
                platform: account.platform,
                socialAccountId: account._id.toString(),
                postId: postId,
                postUrl: postUrl,
                publishedDate: new Date(),
                status: "published",
                userId: post.createdBy,
                teamId: post.teamId,
                organizationId: post.organizationId,
                scheduledPostId: post._id!.toString(),
                createdAt: new Date(),
                updatedAt: new Date(),
                mediaType: post.mediaType,
              });
            } catch (error: any) {
              console.error(
                `Error publishing to platform ${platform.platformId}:`,
                error
              );
              platform.status = "failed";
              platform.errorMessage = error.message || "Failed to publish";
            }
          }

          // Check if all platforms were processed
          const allSuccessful = post.platforms.every(
            (p) => p.status === "published"
          );
          const allFailed = post.platforms.every((p) => p.status === "failed");

          // Update the scheduled post status
          await scheduledPostRepository.update(post._id!.toString(), {
            status: allSuccessful
              ? "completed"
              : allFailed
              ? "failed"
              : "completed",
            platforms: post.platforms,
            updatedAt: new Date(),
          });
        } catch (error: any) {
          console.error(`Error processing scheduled post ${post._id}:`, error);
          await scheduledPostRepository.update(post._id!.toString(), {
            status: "failed",
            updatedAt: new Date(),
          });
        }
      }

      console.log("Finished processing scheduled posts");
    } catch (error) {
      console.error("Error in scheduled post worker:", error);
    }
  }
}
