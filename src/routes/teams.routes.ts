import express from "express";
import {
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from "../controllers/teams.controller";
import {
  authenticateToken,
  requireOrgAccess,
  belongsToTeam,
} from "../middleware/auth.middleware";

const router = express.Router();

// Team routes - all team routes require organization access
router.post("/", authenticateToken, requireOrgAccess, createTeam);
router.get(
  "/organization/:organizationId",
  authenticateToken,
  requireOrgAccess,
  getTeams
);
router.get("/:teamId", authenticateToken, belongsToTeam, getTeam);
router.put("/:teamId", authenticateToken, belongsToTeam, updateTeam);
router.delete("/:teamId", authenticateToken, belongsToTeam, deleteTeam);

// Team member routes - require team access
router.post(
  "/:teamId/members/:userId",
  authenticateToken,
  belongsToTeam,
  addTeamMember
);
router.delete(
  "/:teamId/members/:userId",
  authenticateToken,
  belongsToTeam,
  removeTeamMember
);

export default router;
