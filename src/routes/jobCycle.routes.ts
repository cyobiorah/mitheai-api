// import { Router } from "express";
// import { runNextPostJob } from "../worker/postWorker";

// const router = Router();

// // This endpoint should be triggered by cron-job.org or Upstash Scheduler every 1–5 minutes
// router.get("/", async (req, res) => {
//   const token = req.headers["authorization"];
//   if (token !== `Bearer ${process.env.CRON_SECRET}`) {
//     return res.status(403).json({ message: "Unauthorized" });
//   }

//   const MAX_JOBS = 3; // number of jobs to process per trigger
//   const results = [];

//   for (let i = 0; i < MAX_JOBS; i++) {
//     const result = await runNextPostJob();
//     if (!result) break;
//     results.push(result);
//   }

//   res.status(200).json({ message: `Ran ${results.length} jobs`, results });
// });

// export default router;
