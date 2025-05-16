import { Router } from "express";
import * as instagramController from "../../controllers/platforms/instagram.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.get(
  "/direct-auth",
  requireJwtAuth,
  instagramController.startDirectInstagramOAuth
);
router.get("/callback", instagramController.handleInstagramCallback);
router.post("/:accountId/post", requireJwtAuth, instagramController.post);

export default router;
