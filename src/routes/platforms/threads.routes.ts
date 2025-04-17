import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import * as threadsController from "../../controllers/platforms/threads.controller";

const router = Router();

router.get(
  "/direct-auth",
  requireJwtAuth,
  threadsController.startDirectThreadsAuth
);
router.get("/callback", threadsController.handleThreadsCallback);

export default router;
