import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import {
  startDirectTikTokAuth,
  handleTikTokCallback,
  postToTikTok,
  refreshAndUpdateToken,
  revokeAndRemoveAccount,
} from "../../controllers/platforms/tiktok.controller";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectTikTokAuth);
router.get("/callback", handleTikTokCallback);
router.get("/refresh/:accountId", requireJwtAuth, refreshAndUpdateToken);
router.delete("/revoke/:id", requireJwtAuth, revokeAndRemoveAccount);
router.post("/:accountId/post", requireJwtAuth, postToTikTok);

export default router;
