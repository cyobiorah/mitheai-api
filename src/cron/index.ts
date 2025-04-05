import cron from "node-cron";
import { ScheduledPostWorker } from "../scheduledPost/scheduledPost.worker";

export const setupCronJobs = () => {
  // Run every minute to check for scheduled posts
  cron.schedule("* * * * *", async () => {
    await ScheduledPostWorker.processScheduledPosts();
  });

  console.log("Cron jobs initialized");
};
