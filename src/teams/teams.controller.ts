import { Request, Response } from "express";
import { initAuthController } from "../auth/auth.controller";
import { TeamService } from "./teams.service";
import { isOrganizationUser } from "../appTypes";

// Initialize services
const teamService = TeamService.getInstance();

export const createTeam = async (req: Request, res: Response) => {
  try {
    const { name, description, organizationId } = req.body;

    // Validate required fields
    if (!name || !organizationId) {
      return res.status(400).json({
        error: "Missing required fields: name, organizationId",
      });
    }

    // Create new team
    const newTeam = await teamService.create({
      name,
      description,
      organizationId,
      memberIds: [],
      settings: {
        permissions: ["basic"],
      },
    });

    res.status(201).json(newTeam);
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ error: "Failed to create team" });
  }
};

export const getTeams = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: "Missing required parameter: organizationId",
      });
    }

    // console.log("Getting teams for organization:", {
    //   organizationId,
    //   user: req.user,
    //   params: req.params,
    //   headers: {
    //     authorization: req.headers.authorization ? "Present" : "Missing"
    //   }
    // });

    try {
      const teams = await teamService.findByOrganization(organizationId);
      
      // Ensure we always return an array
      if (!teams) {
        console.log(`No teams found for organization ${organizationId}, returning empty array`);
        return res.json([]);
      }
      
      // If teams is not an array, log a warning and return an empty array
      if (!Array.isArray(teams)) {
        console.warn(`Teams data for organization ${organizationId} is not an array, returning empty array`);
        return res.json([]);
      }
      
      // console.log(`Found ${teams.length} teams for organization ${organizationId}`);
      return res.json(teams);
    } catch (teamError) {
      console.error("Error retrieving teams:", teamError);
      // Return empty array on error instead of error response
      return res.json([]);
    }
  } catch (error) {
    console.error("Error in getTeams controller:", error);
    // Even on general errors, return empty array for consistent frontend experience
    return res.json([]);
  }
};

export const getTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Missing required parameter: id",
      });
    }

    const team = await teamService.findById(id);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json(team);
  } catch (error) {
    console.error("Error getting team:", error);
    res.status(500).json({ error: "Failed to get team" });
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({
        error: "Missing required parameter: id",
      });
    }

    const team = await teamService.findById(id);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    const updatedTeam = await teamService.update(id, updates);

    res.json(updatedTeam);
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ error: "Failed to update team" });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Missing required parameter: id",
      });
    }

    const team = await teamService.findById(id);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    // Get all team members
    const members = await userService.findByTeam(id);

    // Remove team from all members
    for (const member of members) {
      // Only organization users have teamIds
      if (isOrganizationUser(member)) {
        const updatedTeamIds =
          member.teamIds.filter((teamId: string) => teamId !== id) || [];
        await userService.update(member.uid, { teamIds: updatedTeamIds });
      }
    }

    // Delete the team
    await teamService.delete(id);

    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ error: "Failed to delete team" });
  }
};

export const addTeamMember = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { teamId, userId } = req.params;

    if (!teamId || !userId) {
      return res.status(400).json({
        error: "Missing required parameters: teamId, userId",
      });
    }

    // Find user
    const user = await userService.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find team
    const team = await teamService.findById(teamId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    if (team.memberIds.includes(userId)) {
      return res
        .status(400)
        .json({ error: "User is already a member of this team" });
    }

    // Add user to team
    const updatedTeam = await teamService.addMember(teamId, userId);

    // Add team to user's teamIds
    if (isOrganizationUser(user)) {
      const userTeamIds = user.teamIds || [];
      if (!userTeamIds.includes(teamId)) {
        await userService.update(userId, {
          teamIds: [...userTeamIds, teamId],
        });
      }
    }

    res.json(updatedTeam);
  } catch (error) {
    console.error("Error adding team member:", error);
    res.status(500).json({ error: "Failed to add team member" });
  }
};

export const removeTeamMember = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { teamId, userId } = req.params;

    if (!teamId || !userId) {
      return res.status(400).json({
        error: "Missing required parameters: teamId, userId",
      });
    }

    // Find user
    const user = await userService.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find team
    const team = await teamService.findById(teamId);

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    if (!team.memberIds.includes(userId)) {
      return res
        .status(400)
        .json({ error: "User is not a member of this team" });
    }

    // Remove user from team
    const updatedTeam = await teamService.removeMember(teamId, userId);

    // Remove team from user's teamIds
    if (isOrganizationUser(user)) {
      const userTeamIds = user.teamIds || [];

      await userService.update(userId, {
        teamIds: userTeamIds.filter((id: string) => id !== teamId),
      });
    }

    res.json(updatedTeam);
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ error: "Failed to remove team member" });
  }
};
