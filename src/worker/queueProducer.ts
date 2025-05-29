import { getCollections } from "../config/db";
import { postQueue } from "./queue";

export const enqueueScheduledPostJobs = async () => {
  const { scheduledposts } = await getCollections();
  const now = new Date();

  const duePosts = await scheduledposts
    .find({
      status: "scheduled",
      scheduledFor: { $lte: now },
    })
    .toArray();

  let enqueuedCount = 0;

  for (const post of duePosts) {
    for (const platform of post.platforms) {
      await postQueue.add(
        "post-platform",
        {
          scheduledPostId: post._id.toString(),
          platform: {
            platformName: platform.platform,
            accountId: platform.accountId,
          },
          userId: post.createdBy,
          teamId: post.teamId ?? null,
          organizationId: post.organizationId ?? null,
        }
        // { timeout: 15000 }
      );

      enqueuedCount++;
    }

    await scheduledposts.updateOne(
      { _id: post._id },
      { $set: { status: "processing", updatedAt: new Date() } }
    );
  }

  return enqueuedCount;
};
