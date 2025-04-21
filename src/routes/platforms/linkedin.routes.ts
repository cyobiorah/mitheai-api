import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import * as linkedinController from "../../controllers/platforms/linkedin.controller";

const router = Router();

router.get(
  "/direct-auth",
  requireJwtAuth,
  linkedinController.startDirectLinkedinAuth
);

router.get("/callback", linkedinController.handleLinkedinCallback);

router.post("/:accountId/post", requireJwtAuth, linkedinController.post);

export default router;
