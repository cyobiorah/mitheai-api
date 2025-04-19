import { Request, Response, NextFunction } from "express";
import * as usersService from "../services/users.service";
import {
  validateUpdateProfile,
  validateChangePassword,
} from "../validation/user.validation";
import { getCollections } from "../config/db";
import { ObjectId } from "mongodb";

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.id!;
    const user = await usersService.getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch org and teams if they exist
    const { organizations, teams } = await getCollections();
    let organization = null;
    let userTeams: any[] = [];

    if (user.organizationId) {
      organization = await organizations.findOne({
        _id: new ObjectId(user.organizationId),
      });
    }

    if (
      user.teamIds &&
      Array.isArray(user.teamIds) &&
      user.teamIds.length > 0
    ) {
      userTeams = await teams
        .find({ _id: { $in: user.teamIds.map((id: any) => new ObjectId(id)) } })
        .toArray();
    }

    res.json({ user, organization, teams: userTeams });
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
    const userId = (req as any).user.id!;
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
    const userId = (req as any).user.id!;
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
