import express from "express";
import { handleBillingPortal } from "../controllers/billing.controller";

const router = express.Router();

router.post("/billing-portal", handleBillingPortal);

export default router;


// import { Router } from "express";
// import { requireJwtAuth } from "../middlewares/auth";
// import * as payController from "../controllers/pay.controller";

// const router = Router();

// router.post("/pay", requireJwtAuth, payController.createCheckoutSession);

// export default router;
