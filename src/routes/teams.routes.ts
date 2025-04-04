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
import { authenticateToken } from "../middleware/auth.middleware";

const router = express.Router();

router.use(authenticateToken);

// Team routes - all team routes require organization access
router.post("/", createTeam);
router.get("/organization/:organizationId", getTeams);
router.get("/:teamId", getTeam);
router.put("/:teamId", updateTeam);
router.delete("/:teamId", deleteTeam);

// Team member routes - require team access
router.post("/:teamId/members/:userId", addTeamMember);
router.delete("/:teamId/members/:userId", removeTeamMember);

export default router;
