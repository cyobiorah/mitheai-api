import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import organizationsRoutes from "./organizations.routes";
import teamsRoutes from "./teams.routes";
import socialAccountRoutes from "./socialAccount.routes";
import manualCronRoutes from "./manualCron.routes";
import processJobRoutes from "./processJob.routes";
import invitationsRoutes from "./invitations.routes";
import socialPostsRoutes from "./socialPosts.routes";
import scheduledPostsRoutes from "./scheduledPosts.routes";
import collectionsRoutes from "./collections.routes";
import billingRoutes from "./billing.routes";
import checkoutRoutes from "./checkout.routes";
import { skedliiPlans } from "../services/plans.service";
import invoicesRoutes from "./invoices.routes";
import mediaRoutes from "./media.routes";
import queueStatusRoutes from "./queueStatus.routes";
import tiktokTriggerRoutes from "./tiktok.trigger.routes";

const router = Router();

// Auth routes
router.use("/auth", authRoutes);

// User routes
router.use("/users", usersRoutes);

// Invitations routes
router.use("/invitations", invitationsRoutes);

// Pay routes
router.use("/billing", billingRoutes);
router.use("/checkout", checkoutRoutes);

// Organizations routes
router.use("/organizations", organizationsRoutes);

// Teams routes
router.use("/teams", teamsRoutes);

// Social accounts routes
router.use("/social-accounts", socialAccountRoutes);

// Social posts routes
router.use("/social-posts", socialPostsRoutes);

// Collections routes
router.use("/collections", collectionsRoutes);

// Scheduled posts routes
router.use("/scheduled-posts", scheduledPostsRoutes);

// Invoices routes
router.use("/invoices", invoicesRoutes);

// Media routes
router.use("/media", mediaRoutes);

// Example route
router.get("/", (_req, res) => {
  res.json({ message: "Welcome to Skedlii API" });
});

// Manual cron routes
router.use("/manual-cron", manualCronRoutes);

// TikTok trigger routes
router.use("/tiktok", tiktokTriggerRoutes);

// Process job
router.use("/process-job", processJobRoutes);

// Queue status
router.use("/queue-status", queueStatusRoutes);

// App plans routes
router.get("/plans", (_req, res) => {
  res.json(skedliiPlans);
});

export default router;
