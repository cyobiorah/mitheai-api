import { Router } from "express";
import * as organizationsController from "../controllers/organizations.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.post("/", requireJwtAuth, organizationsController.createOrganization);
router.get("/:id", requireJwtAuth, organizationsController.getOrganization);
router.patch(
  "/:id",
  requireJwtAuth,
  organizationsController.updateOrganization
);
router.delete(
  "/:id",
  requireJwtAuth,
  organizationsController.deleteOrganization
);

export default router;
