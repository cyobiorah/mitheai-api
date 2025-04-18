import { Request, Response, NextFunction } from "express";
import * as organizationsService from "../services/organizations.service";
import * as usersService from "../services/users.service";
import {
  validateOrganizationCreate,
  validateOrganizationUpdate,
} from "../validation/organization.validation";

export const createOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { error } = validateOrganizationCreate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    // Only authenticated users can create organizations
    const ownerId = (req as any).user.userId!;
    const org = await organizationsService.createOrganization({
      ...req.body,
      ownerId,
    });
    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
};

export const updateOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const orgId = req.params.id;
    const { error } = validateOrganizationUpdate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    // Only owner/admin can update
    const userId = (req as any).user.id!;
    const updated = await organizationsService.updateOrganization(
      orgId,
      req.body,
      userId
    );
    if (!updated) return res.status(403).json({ message: "Forbidden" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const getOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const orgId = req.params.id;
    const org = await organizationsService.getOrganizationById(orgId);
    if (!org)
      return res.status(404).json({ message: "Organization not found" });

    // Fetch org members
    const members = await usersService.findUsersByOrganizationId(orgId);
    res.json({ organization: org, members });
  } catch (err) {
    next(err);
  }
};

export const deleteOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const orgId = req.params.id;
    const userId = (req as any).user.id!;
    const deleted = await organizationsService.deleteOrganization(
      orgId,
      userId
    );
    if (!deleted) return res.status(403).json({ message: "Forbidden" });
    res.json({ message: "Organization deleted successfully" });
  } catch (err) {
    next(err);
  }
};
