import { Router } from "express";
import { postQueue } from "../worker/queue";
import { postToPlatform } from "../worker/postToPlatform";

const router = Router();

// Triggered by Upstash queue webhook (not publicly exposed)
router.post("/", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  //   eslint-disable-next-line no-void
  //   const [job] = await postQueue.getJobs(["waiting"], 0, 0);
  const [job] = await postQueue.getJobs(["waiting", "delayed", "paused"], 0, 5);
  if (!job) return res.status(200).json({ message: "No job available" });
  if (!job?.data?.scheduledPostId) {
    return res.status(400).json({ message: "Invalid job structure" });
  }

  try {
    const result = await postToPlatform(job.data);

    if (result.success) {
      await job.moveToCompleted("done", true);
      return res.status(200).json({ message: "Job completed", result });
    } else {
      throw new Error(result.error ?? "Post failed");
    }
  } catch (err: any) {
    await job.moveToFailed({ message: err.message }, true);
    return res.status(500).json({ message: "Job failed", error: err.message });
  }
});

export default router;
