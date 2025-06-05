// /worker/tiktok.direct.processor.ts
import { Worker, Job } from "bullmq";
import { connection } from "./queue";
import { uploadToCloudinaryBuffer } from "../utils/cloudinary";
import { post as postToTikTok } from "../services/platforms/tiktok.service";
import { getCollections } from "../config/db";
import axios from "axios";

interface TikTokJobData {
  platform: "tiktok";
  accountId: string;
  userId: string;
  description: string;
  buffer: string[]; // publicIds from Cloudinary
}

const tiktokDirectWorker = new Worker(
  "direct-posts",
  async (job: Job<TikTokJobData>) => {
    console.log("tiktok direct processor file init");
    if (job.name !== "tiktok-post") return;

    const { accountId, userId, description, buffer } = job.data;

    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({ accountId });

    if (!account || !account.accessToken) {
      throw new Error("TikTok account or access token not found.");
    }

    // const mediaFiles = [];

    // for (const publicId of buffer) {
    //   const result = await uploadToCloudinaryBuffer(
    //     {
    //       buffer: Buffer.from(""),
    //       originalname: "",
    //       mimetype: "video/mp4",
    //     } as any, // Dummy placeholder
    //     {
    //       folder: "skedlii",
    //       publicId,
    //       transformations: undefined,
    //     }
    //   );

    //   mediaFiles.push(result.secure_url);
    // }

    // for (const publicId of buffer) {
    //   const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/skedlii/${publicId}.mp4`;

    //   const response = await axios.get(url, { responseType: "arraybuffer" });

    //   mediaFiles.push({
    //     buffer: Buffer.from(response.data),
    //     originalname: `${publicId}.mp4`,
    //     mimetype: "video/mp4",
    //   });
    // }

    // const mediaFiles = buffer.map(
    //   (publicId) =>
    //     `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/skedlii/${publicId}.mp4`
    // );

    // const postResult = await postToTikTok({
    //   postData: {
    //     accessToken: account.accessToken,
    //     accountId,
    //     userId,
    //     content: description,
    //     mediaUrls: mediaFiles.map((file) => file.buffer),
    //     mediaType: "video",
    //     platformAccountId: account.platformAccountId,
    //   },
    //   mediaFiles: mediaFiles as any,
    // });

    const mediaFiles = [];

    console.log("📦 buffer array:", buffer);

    console.log({ bufferLength: buffer.length });

    for (const publicId of buffer) {
      console.log("nowhere is safe");
      const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/skedlii/${publicId}`;

      console.log("🔍 Downloading from:", url);
      const response = await axios.get(url, { responseType: "arraybuffer" });
      console.log("🧪 Buffer length:", response.data?.byteLength);

      console.log("🧪 Download headers:", response.headers);
      console.log("🧪 Buffer size:", response.data?.byteLength);

      mediaFiles.push({
        buffer: Buffer.from(response.data),
        originalname: `${publicId}.mp4`,
        mimetype: "video/mp4",
      });
    }

    const postResult = await postToTikTok({
      postData: {
        accessToken: account.accessToken,
        accountId,
        userId,
        content: description,
        mediaUrls: [], // or omit if not used
        mediaType: "video",
        platformAccountId: account.platformAccountId,
      },
      mediaFiles: mediaFiles as any,
    });
    console.log("🎯 TikTok postResult:", postResult); // <-- Add this

    if (!postResult.success) {
      throw new Error(`TikTok post failed: ${postResult.error}`);
    }

    return postResult;
  },
  { connection }
);

tiktokDirectWorker.on("completed", (job) => {
  console.log(`✅ TikTok job ${job.id} completed`);
});

tiktokDirectWorker.on("failed", (job, err) => {
  console.error(`❌ TikTok job ${job?.id} failed:`, err.message);
});
