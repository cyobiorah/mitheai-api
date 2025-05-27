import { Router } from "express";
import {
  startDirectMetaOAuth,
  handleMetaCallback,
} from "../../controllers/platforms/meta.controller";
import { requireJwtAuth } from "../../middlewares/auth";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectMetaOAuth);
router.get("/callback", handleMetaCallback);

export default router;
