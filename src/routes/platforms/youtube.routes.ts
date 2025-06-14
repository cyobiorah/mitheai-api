import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import {
  startDirectYoutubeAuth,
  handleYoutubeCallback,
  refreshYoutubeAccessToken,
} from "../../controllers/platforms/youtube.controller";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectYoutubeAuth);

router.get("/callback", handleYoutubeCallback);

router.get("/refresh/:accountId", requireJwtAuth, refreshYoutubeAccessToken);

// router.post("/:accountId/post", requireJwtAuth, youtubeController.post);

export default router;
