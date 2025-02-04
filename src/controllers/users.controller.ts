import { Request, Response } from "express";
import { collections } from "../config/firebase";
import { Organization } from "../types";
import type { User } from "../types"; // Keep this import for now
import { sendInvitationEmail } from "../services/email.service";
import { v4 as uuidv4 } from "uuid";

export const getUsers = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: "Missing required parameter: organizationId",
      });
    }

    const usersSnapshot = await collections.users
      .where("organizationId", "==", organizationId)
      .get();

    const users = usersSnapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    res.json(users);
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: "Failed to get users" });
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        error: "Missing required parameter: uid",
      });
    }

    const userDoc = await collections.users.doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      uid: userDoc.id,  
      ...userDoc.data(),
    });
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
};

export const inviteUser = async (req: Request, res: Response) => {
  try {
    const { email, firstName, lastName, role, organizationId } = req.body;

    if (!email || !firstName || !lastName || !role || !organizationId) {
      return res.status(400).json({
        error:
          "Missing required fields: email, firstName, lastName, role, organizationId",
      });
    }

    // Check if user already exists
    const existingUsers = await collections.users
      .where("email", "==", email)
      .where("organizationId", "==", organizationId)
      .get();

    if (!existingUsers.empty) {
      return res.status(400).json({
        error: "User with this email already exists in the organization",
      });
    }

    // Get organization for email
    console.log("Fetching organization:", organizationId);
    const orgDoc = await collections.organizations.doc(organizationId).get();
    if (!orgDoc.exists) {
      console.error("Organization not found:", organizationId);
      return res.status(404).json({ error: "Organization not found" });
    }
    const organization = orgDoc.data() as Organization;
    console.log("Found organization:", organization);

    // Generate invitation token
    const token = uuidv4();

    // Create new user
    const newUser: User = {
      uid: email, // Using email as temporary uid until user accepts invitation
      email,
      firstName,
      lastName,
      role,
      organizationId,
      teamIds: [],
      status: "pending",
      invitationToken: token,
      settings: {
        permissions: [],
        theme: "light",
        notifications: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add user to database
    await collections.users.doc(newUser.uid).set(newUser);

    // Send invitation email
    console.log(
      "Sending invitation email with organization:",
      organization.name
    );
    try {
      await sendInvitationEmail({
        to: email,
        firstName,
        lastName,
        invitationToken: token,
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
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        error: "Missing required parameter: uid",
      });
    }

    const userRef = collections.users.doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    await userRef.update(req.body);

    const updatedUser = await userRef.get();
    res.json({
      uid: updatedUser.id,  
      ...updatedUser.data(),
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: "Missing required parameter: userId",
      });
    }

    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    await collections.users.doc(userId).delete();
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};
