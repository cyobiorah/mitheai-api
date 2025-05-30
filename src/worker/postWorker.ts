import { Worker } from "bullmq";
import { connection } from "./queue";
import { postToPlatform } from "./postToPlatform";

export const scheduledPostWorker = new Worker(
  "scheduled-posts",
  async (job) => {
    const result = await postToPlatform(job.data);

    if (!result.success) {
      const error = new Error(result.error ?? "Post failed");
      // You can attach the type here if needed for logs
      (error as any).errorType = result.errorType;
      throw error;
    }

    return result;
  },
  {
    connection,
    // optional: limits concurrency if needed
    concurrency: 3,
  }
);

// Optional: add listener for logging
scheduledPostWorker.on("completed", (job: any, result: any) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

scheduledPostWorker.on("failed", (job: any, err: any) => {
  console.error(`🔥 Job ${job.id} failed:`, err.message);
});
