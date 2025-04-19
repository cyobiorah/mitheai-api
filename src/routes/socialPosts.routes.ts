import { Router } from "express";
import * as socialPostController from "../controllers/socialPosts.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireJwtAuth, socialPostController.getPosts);
router.delete("/:id", requireJwtAuth, socialPostController.deletePost);

export default router;
