import { Router } from "express";
import { enqueueScheduledPostJobs } from "../worker/queueProducer";
import { shouldSkipTrigger } from "../middlewares/deduplicateTrigger";

const router = Router();

router.get("/", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const source = req.query.source as "qstash" | "cron" | undefined;

  if (source && shouldSkipTrigger(source, source === "qstash" ? 15 : 20)) {
    return res.status(200).json({ message: "Skipped duplicate trigger" });
  }

  try {
    const enqueuedCount = await enqueueScheduledPostJobs();
    res.status(200).json({ message: "Cron ran", enqueued: enqueuedCount });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: "Failed to enqueue jobs", error: error.message });
  }
});

export default router;
