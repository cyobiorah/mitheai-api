import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import {
  startDirectTikTokAuth,
  handleTikTokCallback,
  postToTikTok,
} from "../../controllers/platforms/tiktok.controller";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectTikTokAuth);
router.get("/callback", handleTikTokCallback);
router.post("/:accountId/post", requireJwtAuth, postToTikTok);

export default router;
