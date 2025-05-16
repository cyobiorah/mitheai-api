import { Router } from "express";
import { requireJwtAuth } from "../../middlewares/auth";
import {
  post,
  startDirectThreadsAuth,
  startThreadsConnect,
  handleThreadsCallback,
} from "../../controllers/platforms/threads.controller";

const router = Router();

router.get("/direct-auth", requireJwtAuth, startDirectThreadsAuth);
router.get("/connect", requireJwtAuth, startThreadsConnect);
router.get("/callback", requireJwtAuth, handleThreadsCallback);
router.post(":accountId/post", requireJwtAuth, (req, res) => {
  post({ req, res });
});

export default router;
