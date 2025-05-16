import express from "express";
import { handleBillingPortal } from "../controllers/billing.controller";

const router = express.Router();

router.post("/billing-portal", handleBillingPortal);

export default router;