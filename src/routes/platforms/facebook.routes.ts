import { Router } from "express";
import {
  postToFacebook,
  startDirectFacebookOAuth,
  handleFacebookCallback,
} from "../../controllers/platforms/facebook.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectFacebookOAuth);
router.get("/callback", handleFacebookCallback);

router.post("/:accountId/post", requireJwtAuth, (req, res) =>
  postToFacebook({ req, res })
);

export default router;
