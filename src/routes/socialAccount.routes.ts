import { Router } from "express";
import * as socialAccountController from "../controllers/socialAccount.controller";
import { requireJwtAuth } from "../middlewares/auth";
import twitterRoutes from "./platforms/twitter.routes";
import linkedinRoutes from "./platforms/linkedin.routes";
import threadsRoutes from "./platforms/threads.routes";

const router = Router();

// Platform Routes
router.use("/twitter", twitterRoutes);
router.use("/linkedin", linkedinRoutes);
router.use("/threads", threadsRoutes);

router.get(
  "/",
  requireJwtAuth,
  socialAccountController.getSocialAccountsByOrganizationId
);
router.post("/", requireJwtAuth, socialAccountController.linkSocialAccount);
router.get(
  "/:userId",
  requireJwtAuth,
  socialAccountController.listSocialAccounts
);
router.patch(
  "/:id",
  requireJwtAuth,
  socialAccountController.updateSocialAccount
);
router.delete(
  "/disconnect/:id",
  requireJwtAuth,
  socialAccountController.unlinkSocialAccount
);

// Personal Account
router.get(
  "/:accountId",
  requireJwtAuth,
  socialAccountController.getPersonalAccount
);

export default router;
