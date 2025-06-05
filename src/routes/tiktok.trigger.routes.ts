import { Router } from "express";
import { Queue } from "bullmq";
import { connection } from "../worker/queue";
import { getCollections } from "../config/db";
import { post as postToTikTok } from "../services/platforms/tiktok.service";

const router = Router();

const directPostQueue = new Queue("direct-posts", { connection });

router.get("/trigger-tiktok", async (req, res) => {
  try {
    const [job] = await directPostQueue.getJobs(["waiting"], 0, 1);
    // console.log("👀 Job received:", job?.name);
    // console.log({ job });

    if (!job || job.name !== "tiktok-post") {
      return res.status(200).json({ message: "No TikTok job available" });
    }

    const { accountId, userId, description, buffer } = job.data;

    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({ accountId });

    if (!account || !account.accessToken) {
      await job.moveToFailed({ message: "Missing TikTok account or token" });
      return res.status(400).json({ error: "TikTok account/token not found" });
    }

    const mediaUrls = buffer.map(
      (publicId: string) =>
        `https://res.cloudinary.com/skedlii/video/upload/v1/skedlii/${publicId}.mp4`
    );

    console.log({ mediaUrls });

    const result = await postToTikTok({
      postData: {
        accessToken: account.accessToken,
        accountId,
        userId,
        content: description,
        mediaUrls,
        mediaType: "video",
        platformAccountId: account.platformAccountId,
      },
      mediaFiles: buffer,
      //   mediaFiles: mediaUrls,
    });

    // if (!result.success) {
    //   await job.moveToFailed({ message: result.error ?? "TikTok post failed" });
    //   return res.status(400).json({ error: result.error });
    // }

    // await job.moveToCompleted(result, true);
    // return res.status(200).json({ message: "TikTok post complete", result });

    // ...after result = await postToTikTok(...)
    if (!result.success) {
      console.warn(`❌ TikTok post failed: ${result.error}`);
      await job.remove();
      return res.status(400).json({ error: result.error });
    }

    console.log(`✅ TikTok job ${job.id} completed manually`);
    await job.remove();

    return res.status(200).json({ message: "TikTok post complete", result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
