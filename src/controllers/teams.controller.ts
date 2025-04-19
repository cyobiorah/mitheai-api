import { Request, Response, NextFunction } from "express";
import * as teamsService from "../services/teams.service";
import {
  validateTeamCreate,
  validateTeamUpdate,
} from "../validation/team.validation";

// Create a new team
export const createTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { error } = validateTeamCreate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const userId = (req as any).user.id!;
    const team = await teamsService.createTeam({
      ...req.body,
      creatorId: userId,
    });
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
};

// Get all teams for an organization
export const getTeams = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { organizationId } = req.params;
    const teams = await teamsService.getTeamsByOrganization(organizationId);
    res.json(teams);
  } catch (err) {
    next(err);
  }
};

// Get a single team by ID
export const getTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const team = await teamsService.getTeamById(id);
    if (!team) return res.status(404).json({ message: "Team not found" });
    res.json(team);
  } catch (err) {
    next(err);
  }
};

// Update a team
export const updateTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { error } = validateTeamUpdate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const userId = (req as any).user.id!;
    const updated = await teamsService.updateTeam(id, req.body, userId);
    if (!updated) return res.status(403).json({ message: "Forbidden" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// Delete a team
export const deleteTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id!;
    const deleted = await teamsService.deleteTeam(id, userId);
    if (!deleted) return res.status(403).json({ message: "Forbidden" });
    res.json({ message: "Team deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Add a member to a team
export const addTeamMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, userId } = req.params;
    const actingUserId = (req as any).user.userId!;
    const updatedTeam = await teamsService.addTeamMember(
      id,
      userId,
      actingUserId
    );
    if (!updatedTeam)
      return res.status(403).json({ message: "Forbidden or already a member" });
    res.json(updatedTeam);
  } catch (err) {
    next(err);
  }
};

// Remove a member from a team
export const removeTeamMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, userId } = req.params;
    const actingUserId = (req as any).user.userId!;
    const updatedTeam = await teamsService.removeTeamMember(
      id,
      userId,
      actingUserId
    );
    if (!updatedTeam)
      return res.status(403).json({ message: "Forbidden or not a member" });
    res.json(updatedTeam);
  } catch (err) {
    next(err);
  }
};
