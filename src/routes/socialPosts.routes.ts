import { Router } from "express";
import {
  postToMultiPlatform,
  getPosts,
  deletePost,
  getPostsByUserId,
  getPostsByTeamId,
  getPostsByOrganizationId,
} from "../controllers/socialPosts.controller";
import { requireJwtAuth } from "../middlewares/auth";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
});

const router = Router();

router.get("/", requireJwtAuth, getPosts);
router.delete("/:id", requireJwtAuth, deletePost);

// Personal Posts
router.get("/:userId", requireJwtAuth, getPostsByUserId);

// Team Posts
router.get("/team/:teamId", requireJwtAuth, getPostsByTeamId);

// Organization Posts
router.get(
  "/organization/:organizationId",
  requireJwtAuth,
  getPostsByOrganizationId
);

// Multi Files/Accounts Posts
router.post(
  "/post-to-platforms",
  upload.fields([{ name: "media" }]),
  requireJwtAuth,
  (req, res) => {
    postToMultiPlatform({ req, res });
  }
);

export default router;
