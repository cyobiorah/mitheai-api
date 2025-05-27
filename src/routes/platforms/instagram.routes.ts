import { Router } from "express";
import {
  startDirectInstagramOAuth,
  handleInstagramCallback,
  post,
} from "../../controllers/platforms/instagram.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectInstagramOAuth);
router.get("/callback", handleInstagramCallback);
router.post("/:accountId/post", requireJwtAuth, post);

export default router;
