import { Request, Response } from "express";
import { UserService } from "../services/user.service";
import { OrganizationService } from "../services/organization.service";
import { InvitationService } from "../services/invitation.service";
import { sendInvitationEmail } from "../services/email.service";
import { v4 as uuidv4 } from "uuid";
import { initAuthController } from "./auth.controller";

// Initialize services
// const userService = new UserService();
const organizationService = new OrganizationService();
const invitationService = new InvitationService();

export const getUsers = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: "Missing required parameter: organizationId",
      });
    }

    const users = await userService.findByOrganization(organizationId);

    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        error: "Missing required parameter: uid",
      });
    }

    const user = await userService.findById(uid);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
};

export const inviteUser = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { email, firstName, lastName, role, organizationId } = req.body;

    if (!email || !firstName || !lastName || !role || !organizationId) {
      return res.status(400).json({
        error:
          "Missing required fields: email, firstName, lastName, role, organizationId",
      });
    }

    // Get organization for email
    console.log("Fetching organization:", organizationId);
    const organization = await organizationService.findById(organizationId);

    if (!organization) {
      console.error("Organization not found:", organizationId);
      return res.status(404).json({ error: "Organization not found" });
    }
    console.log("Found organization:", organization);

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser && existingUser.organizationId === organizationId) {
      return res.status(400).json({
        error: "User with this email already exists in the organization",
      });
    }

    // Generate invitation token
    const token = uuidv4();

    // Create invitation
    const invitation = await invitationService.create({
      email,
      firstName,
      lastName,
      role,
      organizationId,
      teamIds: [],
    });

    // Create new user with pending status
    const newUser = await userService.create({
      email,
      firstName,
      lastName,
      role,
      organizationId,
      userType: "organization",
      teamIds: [],
      status: "pending",
      invitationToken: token,
      settings: {
        permissions: [],
        theme: "light",
        notifications: [],
      },
    });

    // Send invitation email
    try {
      await sendInvitationEmail({
        to: email,
        firstName,
        lastName,
        invitationToken: invitation.token,
        organizationName: organization.name,
      });
      console.log("Invitation email sent successfully");
    } catch (emailError) {
      console.error("Error sending invitation email:", emailError);
      // Continue since user is created
    }

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error inviting user:", error);
    res.status(500).json({ error: "Failed to invite user" });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        error: "Missing required parameter: uid",
      });
    }

    const existingUser = await userService.findById(uid);

    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await userService.update(uid, req.body);
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const userService = await initAuthController();
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: "Missing required parameter: userId",
      });
    }

    const user = await userService.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await userService.delete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};
