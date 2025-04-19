import { getCollections } from "../config/db";
import { publish } from "../services/platforms/twitter.service";
// import other platform services as needed

export class SocialPostWorker {
  static async processScheduledPosts() {
    const now = new Date();
    // Find all scheduled posts due for publishing
    const { socialposts, socialaccounts } = await getCollections();
    const posts = socialposts.find({
      status: "scheduled",
      scheduledFor: { $lte: now },
    });

    const results = [];
    for await (const post of posts) {
      try {
        // Fetch the social account
        const account = await socialaccounts.findOne({
          _id: post.socialAccountId,
        });
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
        await socialposts.updateOne(
          { _id: post._id },
          {
            $set: {
              status: "published",
              publishedAt: new Date(),
              publishResult,
            },
          }
        );

        results.push({ postId: post._id, status: "published" });
      } catch (err: any) {
        // Mark post as failed
        post.status = "failed";
        post.publishResult = { error: err.message };
        await socialposts.updateOne(
          { _id: post._id },
          { $set: { status: "failed", publishResult: { error: err.message } } }
        );

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
