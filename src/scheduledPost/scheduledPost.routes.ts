import express from "express";
import { authenticateToken } from "../auth/auth.middleware";
import { ScheduledPostController } from "./scheduledPost.controller";
import { validateObjectId } from "../shared/validateObjectId";

const router = express.Router();

// Create a new scheduled post
router.post("/", ScheduledPostController.createScheduledPost);

// Get all scheduled posts for the authenticated user
router.get("/", ScheduledPostController.getScheduledPosts);

// Update a scheduled post
router.put(
  "/:postId",
  validateObjectId("postId"),
  ScheduledPostController.updateScheduledPost
);

// Delete a scheduled post
router.delete(
  "/:postId",
  validateObjectId("postId"),
  ScheduledPostController.deleteScheduledPost
);

export default router;
