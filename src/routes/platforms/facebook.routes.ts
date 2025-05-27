import { Router } from "express";
import { postToFacebook } from "../../controllers/platforms/facebook.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.post("/:accountId/post", requireJwtAuth, (req, res) =>
  postToFacebook({ req, res })
);

export default router;
