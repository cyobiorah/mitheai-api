import { Router } from "express";
import * as socialPostController from "../controllers/socialPosts.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

// router.get("/", requireJwtAuth, socialPostController.getPosts);
router.delete("/:id", requireJwtAuth, socialPostController.deletePost);

// Personal Posts
router.get("/:userId", requireJwtAuth, socialPostController.getPostsByUserId);

// Team Posts
router.get(
  "/team/:teamId",
  requireJwtAuth,
  socialPostController.getPostsByTeamId
);

// Organization Posts
router.get(
  "/organization/:organizationId",
  requireJwtAuth,
  socialPostController.getPostsByOrganizationId
);

export default router;
