import { Router } from "express";
import {
  getLoggedInUsersScheduledPosts,
  getSingleScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
} from "../controllers/scheduledPosts.controller";
import { requireJwtAuth } from "../middlewares/auth";
import multer from "multer";
import { postToMultiPlatform } from "../controllers/socialPosts.controller";

const upload = multer({
  storage: multer.memoryStorage(),
});

const router = Router();

router.get("/", requireJwtAuth, getLoggedInUsersScheduledPosts);
router.get("/:id", requireJwtAuth, getSingleScheduledPost);
router.post(
  "/",
  upload.fields([{ name: "media" }]),
  requireJwtAuth,
  (req, res) => {
    postToMultiPlatform({ req, res });
  }
);
router.put("/:id", requireJwtAuth, updateScheduledPost);
router.delete("/:id", requireJwtAuth, deleteScheduledPost);

export default router;
