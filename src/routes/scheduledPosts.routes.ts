import { Router } from "express";
import * as scheduledPostsController from "../controllers/scheduledPosts.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireJwtAuth, scheduledPostsController.listScheduledPosts);
router.post("/", requireJwtAuth, scheduledPostsController.createScheduledPost);
router.put(
  "/:id",
  requireJwtAuth,
  scheduledPostsController.updateScheduledPost
);
router.delete(
  "/:id",
  requireJwtAuth,
  scheduledPostsController.deleteScheduledPost
);

export default router;
