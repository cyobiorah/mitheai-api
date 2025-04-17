import SocialPost from "../models/socialPost.model";
import SocialAccount from "../models/socialAccount.model";
import { publish } from "../services/platforms/twitter.service";
// import other platform services as needed

export class SocialPostWorker {
  static async processScheduledPosts() {
    const now = new Date();
    // Find all scheduled posts due for publishing
    const posts = await SocialPost.find({
      status: "scheduled",
      scheduledFor: { $lte: now },
    });

    const results = [];
    for (const post of posts) {
      try {
        // Fetch the social account
        const account = await SocialAccount.findById(post.socialAccountId);
        if (!account) throw new Error("Social account not found");

        // Choose the right service based on platform
        let publishResult;
        if (account.platform === "twitter") {
          publishResult = await publish(post, account);
        }
        // Add logic for other platforms...

        // Mark post as published
        post.status = "published";
        post.publishedAt = new Date();
        post.publishResult = publishResult;
        await post.save();

        results.push({ postId: post._id, status: "published" });
      } catch (err: any) {
        // Mark post as failed
        post.status = "failed";
        post.publishResult = { error: err.message };
        await post.save();

        results.push({
          postId: post._id,
          status: "failed",
          error: err.message,
        });
      }
    }
    return results;
  }
}
