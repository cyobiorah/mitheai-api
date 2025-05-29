import { Queue } from "bullmq";
import IORedis from "ioredis";

import dotenv from "dotenv";
dotenv.config();

export const connection = new IORedis(process.env.UPSTASH_REDIS_REST_URL!, {
  maxRetriesPerRequest: null,
});

export const postQueue = new Queue("scheduled-posts", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: { count: 5 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    // timeout: 15000,
  },
});
