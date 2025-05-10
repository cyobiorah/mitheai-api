import { Router } from "express";
import {
  getIndividualInvoicesController,
  getOrganizationInvoicesController,
} from "../controllers/invoices.controller";
import { allowRoles } from "../middlewares/authorizeRoles";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.get("/user/:userId", requireJwtAuth, getIndividualInvoicesController);
router.get(
  "/organization/:organizationId",
  requireJwtAuth,
  allowRoles("org_owner", "super_admin"),
  getOrganizationInvoicesController
);

export default router;
