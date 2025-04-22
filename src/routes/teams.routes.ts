import { Router } from "express";
import * as teamsController from "../controllers/teams.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.post("/", requireJwtAuth, teamsController.createTeam);
router.get(
  "/organization/:organizationId",
  requireJwtAuth,
  teamsController.getTeams
);
router.get("/:id", requireJwtAuth, teamsController.getTeam);
router.patch("/:id", requireJwtAuth, teamsController.updateTeam);
router.delete("/:id", requireJwtAuth, teamsController.deleteTeam);

// Member management
router.post(
  "/:id/members/:userId",
  requireJwtAuth,
  teamsController.addTeamMember
);
router.delete(
  "/:id/members/:userId",
  requireJwtAuth,
  teamsController.removeTeamMember
);

export default router;
