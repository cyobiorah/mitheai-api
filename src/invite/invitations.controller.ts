import { Request, Response } from "express";
import { sendInvitationEmail } from "../services/email.service";
import { InvitationService } from "./invitations.service";
import { RepositoryFactory } from "../repositories/repository.factory";

// Initialize services
const invitationService = new InvitationService();

export const createInvitation = async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName, role, organizationId, teamIds } =
      req.body;

    if (!email || !firstName || !lastName || !role || !organizationId) {
      return res.status(400).json({
        error:
          "Missing required fields: email, firstName, lastName, role, organizationId",
      });
    }

    // Get repositories
    const userRepository = await RepositoryFactory.createUserRepository();
    const organizationRepository =
      await RepositoryFactory.createOrganizationRepository();

    // Check if user already exists in the organization
    const existingUsers = await userRepository.find({
      email,
      organizationId: organizationId,
    });

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({
        error: "User with this email already exists in the organization",
      });
    }

    // Get organization name for the email
    console.log("Fetching organization:", organizationId);

    // Use the organizationId directly - the repository should handle ObjectId conversion
    const organization = await organizationRepository.findById(organizationId);
    if (!organization) {
      console.error("Organization not found:", organizationId);
      return res.status(404).json({ error: "Organization not found" });
    }

    // Create invitation using the service
    try {
      const invitation = await invitationService.create({
        email,
        firstName,
        lastName,
        role,
        organizationId,
        teamIds: teamIds ?? [],
      });

      console.log("Created invitation with ID:", invitation.id);

      // Send invitation email
      console.log(
        "Sending invitation email with organization:",
        organization.name
      );
      await sendInvitationEmail({
        to: email,
        firstName,
        lastName,
        invitationToken: invitation.token,
        organizationName: organization.name,
      });

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      return res.status(500).json({ error: "Failed to create invitation" });
    }
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
};

export const verifyInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Find invitation by token
    const invitation = await invitationService.findByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: "Invalid or expired invitation" });
    }

    // Check if invitation is still valid
    if (invitation.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Invitation has already been used or expired" });
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      await invitationService.cancel(invitation.id);
      return res.status(400).json({ error: "Invitation has expired" });
    }

    // Get organization name
    const organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
    const organization = await organizationRepository.findById(
      invitation.organizationId
    );
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    res.json({
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      organizationName: organization.name,
    });
  } catch (error) {
    console.error("Error verifying invitation:", error);
    res.status(500).json({ error: "Failed to verify invitation" });
  }
};

export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    console.log("Accept invitation request:", {
      params: req.params,
      body: req.body,
      url: req.url,
    });

    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required" });
    }

    try {
      // Use the invitation service to handle the acceptance
      const user = await invitationService.accept(token, { password });

      if (!user) {
        return res.status(500).json({ error: "Failed to create user account" });
      }

      res.json({
        message: "Account created successfully",
        email: user.email,
        requiresVerification: true,
      });
    } catch (error: any) {
      console.error("Error accepting invitation:", error);

      // Handle specific error cases
      if (error.message.includes("already exists")) {
        return res
          .status(400)
          .json({ error: "An account with this email already exists" });
      }

      if (
        error.message.includes("expired") ||
        error.message.includes("Invalid invitation")
      ) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: "Failed to accept invitation" });
    }
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ error: "Failed to accept invitation" });
  }
};

export const resendInvitation = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find pending invitations for this email
    const invitations = await invitationService.findByEmail(email);
    const pendingInvitations = invitations.filter(
      (inv) => inv.status === "pending"
    );

    if (pendingInvitations.length === 0) {
      return res
        .status(404)
        .json({ error: "No pending invitation found for this email" });
    }

    const invitation = pendingInvitations[0];

    // Get organization name for the email
    const organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
    const organization = await organizationRepository.findById(
      invitation.organizationId
    );
    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Cancel the existing invitation
    await invitationService.cancel(invitation.id);

    // Create a new invitation
    const newInvitation = await invitationService.create({
      email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      role: invitation.role,
      organizationId: invitation.organizationId,
      teamIds: invitation.teamIds || [],
    });

    // Send new invitation email
    await sendInvitationEmail({
      to: email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      invitationToken: newInvitation.token,
      organizationName: organization.name,
    });

    res.json({ message: "Invitation resent successfully" });
  } catch (error) {
    console.error("Error resending invitation:", error);
    res.status(500).json({ error: "Failed to resend invitation" });
  }
};
