import { Worker } from "bullmq";
import { postQueue, connection } from "./queue";
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

// import { postQueue } from "./queue";
// import { postToPlatform } from "./postToPlatform";

// export const runNextPostJob = async () => {
//   const [job] = await postQueue.getJobs(["waiting"], 0, 0);

//   if (!job) return null;

//   try {
//     const result = await postToPlatform(job.data);

//     if (result?.success) {
//       await job.moveToCompleted("done", true);
//       return { success: true, jobId: job.id };
//     } else {
//       const errorType = result.errorType ?? "UNHANDLED_EXCEPTION";

//       // Remove only if failure is unrecoverable
//       if (["MISSING_POST", "MISSING_ACCOUNT"].includes(errorType)) {
//         await job.remove();
//       } else {
//         await job.moveToFailed({ message: result.error }, true);
//       }

//       return {
//         success: false,
//         jobId: job.id,
//         error: result.error,
//         errorType,
//       };
//     }
//   } catch (err: any) {
//     await job.moveToFailed({ message: err.message }, true);
//     return {
//       success: false,
//       jobId: job.id,
//       error: err.message,
//       errorType: "UNHANDLED_EXCEPTION",
//     };
//   }
// };

// // eslint-
// // export const runNextPostJob = async () => {
// //   const [job] = await postQueue.getJobs(["waiting"], 0, 0);
// //   if (!job) return null;
// //   try {
// //     const result = await postToPlatform(job.data);
// //     if (result?.success) {
// //       console.log(`✅ Job ${job.id} completed successfully`);
// //       //   eslint-disable-next-line no-void
// //       //   await job.moveToCompleted("done", true);
// //       await job.remove(); // Cleanly delete job after success
// //     } else {
// //       throw new Error(result?.error ?? "Post failed");
// //     }
// //     return { success: true, jobId: job.id };
// //   } catch (err: any) {
// //     console.error(`🔥 Job ${job.id} failed: ${err.message}`);
// //     await job.moveToFailed({ message: err.message }, true); // Allow retry
// //     return { success: false, jobId: job.id, error: err.message };
// //   }
// // };
