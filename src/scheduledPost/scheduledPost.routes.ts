import express from "express";
import { ScheduledPostController } from "./scheduledPost.controller";
import { validateObjectId } from "../shared/validateObjectId";

const router = express.Router();

// Create a new scheduled post
router.post("/", ScheduledPostController.createScheduledPost);

// Get all scheduled posts for the authenticated user
router.get("/", ScheduledPostController.getScheduledPosts);

// Get a scheduled post by ID
router.get(
  "/:postId",
  validateObjectId("postId"),
  ScheduledPostController.getScheduledPostById
);

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
