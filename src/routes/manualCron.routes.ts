import { Router } from "express";
import { SocialPostWorker } from "../worker/scheduledPost.worker";

const router = Router();

router.get("/", async (req, res) => {
  const token = req.headers["authorization"];
  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(403).json({ message: "Unauthorized" });
  }
  const result = await SocialPostWorker.processScheduledPosts();
  res.status(200).json({ message: "Cron ran", result });
});

export default router;
