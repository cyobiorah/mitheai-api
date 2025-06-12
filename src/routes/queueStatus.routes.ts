import { Router } from "express";
import { postQueue } from "../worker/queue";

const router = Router();

router.get("/", async (_req, res) => {
  // @ts-ignore
  // // Remove all completed jobs
  // await postQueue.clean(0, 1000, "completed");
  // // Remove all failed jobs
  // await postQueue.clean(0, 1000, "failed");
  // // Optionally clear delayed/waiting jobs
  // await postQueue.clean(0, 1000, "delayed");
  // await postQueue.clean(0, 1000, "paused");
  try {
    const counts = await postQueue.getJobCounts();
    const jobs = await postQueue.getJobs(
      ["waiting", "active", "delayed", "failed", "completed"],
      0,
      10
    );

    res.status(200).json({
      counts,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        returnValue: job.returnvalue,
        state: job.stateName,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
