import express from "express";
import {
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from "./teams.controller";
import { authenticateToken } from "../auth/auth.middleware";
import { validateObjectId } from "../shared/validateObjectId";

const router = express.Router();

router.use(authenticateToken);

// Team routes - all team routes require organization access
router.post("/", createTeam);
router.get(
  "/organization/:organizationId",
  validateObjectId("organizationId"),
  getTeams
);
router.get("/:teamId", validateObjectId("teamId"), getTeam);
router.put("/:teamId", validateObjectId("teamId"), updateTeam);
router.delete("/:teamId", validateObjectId("teamId"), deleteTeam);

// Team member routes - require team access
router.post(
  "/:teamId/members/:userId",
  validateObjectId("teamId"),
  validateObjectId("userId"),
  addTeamMember
);
router.delete(
  "/:teamId/members/:userId",
  validateObjectId("teamId"),
  validateObjectId("userId"),
  removeTeamMember
);

export default router;
