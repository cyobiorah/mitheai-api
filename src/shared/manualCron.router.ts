import { Router } from "express";
import { ScheduledPostWorker } from "../scheduledPost/scheduledPost.worker";

const router = Router();

router.get("/", async (req, res) => {
  const token = req.headers["authorization"];

  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const timestamp = new Date().toISOString();
  console.log(
    `[Manual Cron] Triggered at ${timestamp} by ${req.method} request`
  );

  // Run your job logic here
  const result = await ScheduledPostWorker.processScheduledPosts();
  res.status(200).json({ message: "Cron ran", timestamp, result });
});

export default router;
