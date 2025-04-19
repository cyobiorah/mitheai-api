import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import organizationsRoutes from "./organizations.routes";
import teamsRoutes from "./teams.routes";
import socialAccountRoutes from "./socialAccount.routes";
import manualCronRoutes from "./manualCron.routes";
import invitationsRoutes from "./invitations.routes";
import socialPostsRoutes from "./socialPosts.routes";
import scheduledPostsRoutes from "./scheduledPosts.routes";

const router = Router();

// Auth routes
router.use("/auth", authRoutes);

// User routes
router.use("/users", usersRoutes);

// Invitations routes
router.use("/invitations", invitationsRoutes);

// Organizations routes
router.use("/organizations", organizationsRoutes);

// Teams routes
router.use("/teams", teamsRoutes);

// Social accounts routes
router.use("/social-accounts", socialAccountRoutes);

// Social posts routes
router.use("/social-posts", socialPostsRoutes);

// Scheduled posts routes
router.use("/scheduled-posts", scheduledPostsRoutes);

// Example route
router.get("/", (_req, res) => {
  res.json({ message: "Welcome to MitheAI API" });
});

// Manual cron routes
router.use("/manual-cron", manualCronRoutes);

export default router;
