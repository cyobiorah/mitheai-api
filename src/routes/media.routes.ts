import { Router } from "express";
import { requireJwtAuth } from "../middlewares/auth";
import { getSignedCloudinaryParams } from "../controllers/media.controller";

const router = Router();

router.post(
  "/cloudinary/signature",
  requireJwtAuth,
  getSignedCloudinaryParams
);

export default router;
