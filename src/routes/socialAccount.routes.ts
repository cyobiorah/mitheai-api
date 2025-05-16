import { Router } from "express";
import * as socialAccountController from "../controllers/socialAccount.controller";
import { requireJwtAuth } from "../middlewares/auth";
import twitterRoutes from "./platforms/twitter.routes";
import linkedinRoutes from "./platforms/linkedin.routes";
import threadsRoutes from "./platforms/threads.routes";
import instagramRoutes from "./platforms/instagram.routes";

const router = Router();

// Platform Routes
router.use("/twitter", twitterRoutes);
router.use("/linkedin", linkedinRoutes);
router.use("/threads", threadsRoutes);
router.use("/instagram", instagramRoutes);

// Get Social Accounts by Organization
router.get(
  "/",
  requireJwtAuth,
  socialAccountController.getSocialAccountsByOrganizationId
);

// Link Social Account
router.post("/", requireJwtAuth, socialAccountController.linkSocialAccount);

// List Social Accounts
router.get(
  "/:userId",
  requireJwtAuth,
  socialAccountController.listSocialAccounts
);

// Update Social Account
router.patch(
  "/:id",
  requireJwtAuth,
  socialAccountController.updateSocialAccount
);

// Unlink Social Account
router.delete(
  "/disconnect/:id",
  requireJwtAuth,
  socialAccountController.unlinkSocialAccount
);

// Get Personal Account (userType: "personal")
router.get(
  "/:accountId",
  requireJwtAuth,
  socialAccountController.getPersonalAccount
);

// Assign/Unassign Social Account to Team
router.patch(
  "/:id/assign",
  requireJwtAuth,
  socialAccountController.assignSocialAccountToTeam
);

// List social accounts by team
router.get(
  "/team/:teamId",
  requireJwtAuth,
  socialAccountController.listSocialAccountsByTeam
);

export default router;
