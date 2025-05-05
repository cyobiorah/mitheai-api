import { Router } from "express";
import {
  getIndividualInvoicesController,
  getOrganizationInvoicesController,
} from "../controllers/invoices.controller";
import { allowRoles } from "../middlewares/authorizeRoles";

const router = Router();

router.get("/user/:userId", getIndividualInvoicesController);
router.get(
  "/organization/:organizationId",
  allowRoles("org_owner", "super_admin"),
  getOrganizationInvoicesController
);

export default router;
