import { Request, Response, NextFunction } from "express";
import * as usersService from "../services/users.service";
import {
  validateUpdateProfile,
  validateChangePassword,
} from "../validation/user.validation";
import organizationModel from "../models/organization.model";
import teamModel, { ITeam } from "../models/team.model";

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId!;
    const user = await usersService.getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch org and teams if they exist
    let organization = null;
    let teams: ITeam[] = [];

    if (user.organizationId) {
      organization = await organizationModel.findById(user.organizationId);
    }

    if (user.teamIds) {
      teams = await teamModel.find({ _id: { $in: user.teamIds } });
    }

    res.json({ user, organization, teams });
  } catch (err) {
    next(err);
  }
};

export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId!;
    const { error } = validateUpdateProfile(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const updatedUser = await usersService.updateUserProfile(userId, req.body);
    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId!;
    const { error } = validateChangePassword(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    await usersService.changeUserPassword(
      userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
};
