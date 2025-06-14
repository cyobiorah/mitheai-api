import { Router } from "express";
import {
  getSocialAccountsByOrganizationId,
  linkSocialAccount,
  listSocialAccounts,
  updateSocialAccount,
  unlinkSocialAccount,
  getPersonalAccount,
  assignSocialAccountToTeam,
  listSocialAccountsByTeam,
} from "../controllers/socialAccount.controller";
import { requireJwtAuth } from "../middlewares/auth";
import twitterRoutes from "./platforms/twitter.routes";
import linkedinRoutes from "./platforms/linkedin.routes";
import threadsRoutes from "./platforms/threads.routes";
import instagramRoutes from "./platforms/instagram.routes";
import metaRoutes from "./platforms/meta.routes";
import facebookRoutes from "./platforms/facebook.routes";
import tiktokRoutes from "./platforms/tiktok.routes";
import youtubeRoutes from "./platforms/youtube.routes";

const router = Router();

// Platform Routes
router.use("/twitter", twitterRoutes);
router.use("/linkedin", linkedinRoutes);
router.use("/threads", threadsRoutes);
router.use("/instagram", instagramRoutes);
router.use("/meta", metaRoutes);
router.use("/facebook", facebookRoutes);
router.use("/tiktok", tiktokRoutes);
router.use("/youtube", youtubeRoutes);

// Get Social Accounts by Organization
router.get("/", requireJwtAuth, getSocialAccountsByOrganizationId);

// Link Social Account
router.post("/", requireJwtAuth, linkSocialAccount);

// List Social Accounts
router.get("/:userId", requireJwtAuth, listSocialAccounts);

// Update Social Account
router.patch("/:id", requireJwtAuth, updateSocialAccount);

// Unlink Social Account
router.delete("/disconnect/:id", requireJwtAuth, unlinkSocialAccount);

// Get Personal Account (userType: "personal")
router.get("/:accountId", requireJwtAuth, getPersonalAccount);

// Assign/Unassign Social Account to Team
router.patch("/:id/assign", requireJwtAuth, assignSocialAccountToTeam);

// List social accounts by team
router.get("/team/:teamId", requireJwtAuth, listSocialAccountsByTeam);

export default router;
