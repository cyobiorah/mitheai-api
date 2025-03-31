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
  belongsToTeam,
  authenticateToken,
} from "../middleware/auth.middleware";

const router = express.Router();

router.use(authenticateToken);

// Team routes - all team routes require organization access
router.post("/", createTeam);
router.get("/organization/:organizationId", getTeams);
router.get("/:teamId", belongsToTeam, getTeam);
router.put("/:teamId", belongsToTeam, updateTeam);
router.delete("/:teamId", belongsToTeam, deleteTeam);

// Team member routes - require team access
router.post("/:teamId/members/:userId", belongsToTeam, addTeamMember);
router.delete("/:teamId/members/:userId", belongsToTeam, removeTeamMember);

export default router;
