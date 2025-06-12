import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import {
  startDirectYoutubeAuth,
  handleYoutubeCallback,
} from "../../controllers/platforms/youtube.controller";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectYoutubeAuth);

router.get("/callback", handleYoutubeCallback);

// router.post("/:accountId/post", requireJwtAuth, youtubeController.post);

export default router;
