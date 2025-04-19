import { Router } from "express";
import * as twitterController from "../../controllers/platforms/twitter.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.get(
  "/direct-auth",
  requireJwtAuth,
  twitterController.startDirectTwitterOAuth
);
router.get("/callback", twitterController.handleTwitterCallback);

router.post("/:id/post", requireJwtAuth, twitterController.post);

export default router;
