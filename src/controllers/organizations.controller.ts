import { Request, Response } from "express";
import { OrganizationService } from "../services/organization.service";
import { Organization } from "../types";

// Initialize services
const organizationService = OrganizationService.getInstance();

export const createOrUpdateOrganization = async (
  req: Request,
  res: Response
) => {
  try {
    const { id, name, description, type, ownerId } = req.body;

    if (!name || !type || !ownerId) {
      return res.status(400).json({
        error: "Missing required fields: name, type, ownerId",
      });
    }

    // Validate organization type
    if (!["enterprise", "business", "startup"].includes(type)) {
      return res.status(400).json({
        error:
          "Invalid organization type. Must be one of: enterprise, business, startup",
      });
    }

    // Create or update organization
    let organization: Organization;

    if (id) {
      // Update existing organization
      const existingOrg = await organizationService.findById(id);

      if (!existingOrg) {
        return res.status(404).json({
          error: "Organization not found",
        });
      }

      organization = (await organizationService.update(id, {
        name,
        description,
        type: type as "enterprise" | "business" | "startup",
        settings: {
          permissions: req.body.permissions || existingOrg.settings.permissions,
          maxTeams: req.body.maxTeams || existingOrg.settings.maxTeams,
          maxUsers: req.body.maxUsers || existingOrg.settings.maxUsers,
          features: req.body.features || existingOrg.settings.features,
        },
      })) as Organization;
    } else {
      // Create new organization
      organization = await organizationService.create({
        name,
        description,
        ownerId,
        type: type as "enterprise" | "business" | "startup",
        settings: {
          permissions: req.body.permissions || [],
          maxTeams: type === "enterprise" ? 999 : type === "business" ? 10 : 3,
          maxUsers: type === "enterprise" ? 999 : type === "business" ? 50 : 10,
          features: req.body.features || [],
        },
      });
    }

    res.status(201).json(organization);
  } catch (error) {
    console.error("Error creating/updating organization:", error);
    res.status(500).json({ error: "Failed to create/update organization" });
  }
};

export const getOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Missing required parameter: id",
      });
    }

    const organization = await organizationService.findById(id);

    if (!organization) {
      return res.status(404).json({
        error: "Organization not found",
      });
    }

    res.json(organization);
  } catch (error) {
    console.error("Error getting organization:", error);
    res.status(500).json({ error: "Failed to get organization" });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Missing required parameter: id",
      });
    }

    const organization = await organizationService.findById(id);

    if (!organization) {
      return res.status(404).json({
        error: "Organization not found",
      });
    }

    await organizationService.delete(id);

    res.json({ message: "Organization deleted successfully" });
  } catch (error) {
    console.error("Error deleting organization:", error);
    res.status(500).json({ error: "Failed to delete organization" });
  }
};
