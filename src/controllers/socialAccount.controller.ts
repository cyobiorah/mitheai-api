import { Request, Response, NextFunction } from "express";
import * as socialAccountService from "../services/socialAccount.service";
import {
  validateSocialAccountCreate,
  validateSocialAccountUpdate,
} from "../validation/socialAccount.validation";

// Link a new social account
export const linkSocialAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { error } = validateSocialAccountCreate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const userId = (req as any).user.id!;
    const socialAccount = await socialAccountService.linkAccount({
      ...req.body,
      userId,
    });
    res.status(201).json(socialAccount);
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate key error (unique index violation)
      return res.status(409).json({
        message:
          "This social account is already linked to another user/team/org.",
      });
    }
    next(err);
  }
};

// List all social accounts for the current user (optionally filter by org/team)
export const listSocialAccounts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accounts = await socialAccountService.listAccounts({
      userId: (req as any).user.id!,
      organizationId: (req as any).user.organizationId!,
      teamId: req.query.teamId ? (req.query.teamId as string) : undefined,
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

// Update a social account (e.g., refresh tokens)
export const updateSocialAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { error } = validateSocialAccountUpdate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const userId = (req as any).user.id!;
    const updated = await socialAccountService.updateAccount(
      id,
      req.body,
      userId
    );
    if (!updated) return res.status(403).json({ message: "Forbidden" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// Unlink (delete) a social account
export const unlinkSocialAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id!;
    const deleted = await socialAccountService.unlinkAccount(id, userId);
    if (!deleted) return res.status(403).json({ message: "Forbidden" });
    res.json({ message: "Social account unlinked successfully" });
  } catch (err) {
    next(err);
  }
};

// Get social accounts by organizationId
export const getSocialAccountsByOrganizationId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    const accounts = await socialAccountService.listAccountsByOrganizationId(
      organizationId
    );
    res.json(accounts);
  } catch (err) {
    next(err);
  }
};
