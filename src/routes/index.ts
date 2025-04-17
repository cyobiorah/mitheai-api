import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import organizationsRoutes from "./organizations.routes";
import teamsRoutes from "./teams.routes";
import socialAccountRoutes from "./socialAccount.routes";
import manualCronRoutes from "./manualCron.routes";
import invitationsRoutes from "./invitations.routes";

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

// Example route
router.get("/", (_req, res) => {
  res.json({ message: "Welcome to MitheAI API" });
});

// Manual cron routes
router.use("/manualCron", manualCronRoutes);

export default router;
