import { Request, Response, NextFunction } from "express";
import * as socialAccountService from "../services/socialAccount.service";
import {
  validateSocialAccountCreate,
  validateSocialAccountUpdate,
} from "../validation/socialAccount.validation";
import { sanitizeAccount } from "../utils";

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

export const listSocialAccounts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { userId } = req.params;
  const user = (req as any).user;

  try {
    // Only allow users to list their own accounts, or org admins to list org accounts
    const isOrgAdmin = ["super_admin", "org_owner"].includes(user.role);
    const isSelf = userId === user.id;

    if (!isSelf && !isOrgAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Fetch all accounts for the user
    let accounts = await socialAccountService.listAccounts({ userId });

    // For org users (not admin), filter to only accounts assigned to teams the user is in
    if (!isOrgAdmin) {
      const userTeamIds = (user.teamIds ?? []).map(String);
      accounts = accounts.filter(
        (acc: any) =>
          !acc.organizationId || // not org-linked
          (acc.teamId && userTeamIds.includes(String(acc.teamId)))
      );
    }

    // Sanitize accounts to remove sensitive information
    res.json(accounts.map((account) => sanitizeAccount(account)));
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
    // Sanitize accounts to remove sensitive information
    res.json(accounts.map((account) => sanitizeAccount(account)));
  } catch (err) {
    next(err);
  }
};

// Get personal account
export const getPersonalAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { accountId } = req.params;
    const account = await socialAccountService.getPersonalAccount(accountId);
    if (!account) return res.status(404).json({ message: "Account not found" });
    // Sanitize account to remove sensitive information
    res.json(sanitizeAccount(account));
  } catch (err) {
    next(err);
  }
};

// Assign/Unassign Social Account to Team
export const assignSocialAccountToTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { teamId } = req.body; // teamId can be string or null
    const user = (req as any).user;

    // Only org super_admin or org_owner can assign/unassign
    if (!["super_admin", "org_owner"].includes(user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await socialAccountService.assignToTeam({
      accountId: id,
      teamId,
      organizationId: user.organizationId,
    });

    if (!result) {
      return res.status(400).json({ message: "Invalid account or team" });
    }

    // Sanitize account to remove sensitive information
    res.json({
      message: "Social account assignment updated",
      account: sanitizeAccount(result),
    });
  } catch (err) {
    next(err);
  }
};

// List social accounts by team
export const listSocialAccountsByTeam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { teamId } = req.params;
    const user = (req as any).user;

    // Fetch user's teams and role
    // (Assume a helper function getUserTeamsAndRole(user) returns { teams: [], role: "" })
    // For MVP, check if user is in team or is org admin
    const isOrgAdmin = ["super_admin", "org_owner"].includes(user.role);

    // Check if user is in the team (assume user.teamIds is an array of ObjectId strings)
    const isTeamMember = user.teamIds?.map(String).includes(teamId);

    if (!isOrgAdmin && !isTeamMember) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const accounts = await socialAccountService.listAccountsByTeamId(teamId);
    // Sanitize accounts to remove sensitive information
    res.json(accounts.map((account) => sanitizeAccount(account)));
  } catch (err) {
    next(err);
  }
};
