import { Request, Response } from "express";
import * as invitationsService from "../services/invitations.service";
import { sendInvitationEmail } from "../services/email.service";
import bcrypt from "bcrypt";
import { getCollections } from "../config/db";
import { ObjectId } from "mongodb";

export const createInvitation = async (req: Request, res: Response) => {
  const { email, firstName, lastName, role, organizationId } =
    req.body;
  if (!email || !firstName || !lastName || !role || !organizationId)
    return res.status(400).json({ error: "Missing required fields" });

  // Check if user already exists in org
  const { users } = await getCollections();
  const existing = await users.findOne({ email, organizationId });
  if (existing)
    return res.status(400).json({
      error: "User with this email already exists in the organization",
    });

  const password = await bcrypt.hash("Password@12", 10);

  // Get org for email
  const { organizations } = await getCollections();
  const org = await organizations.findOne({
    _id: new ObjectId(organizationId),
  });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  // Create a pending user
  await users.insertOne({
    email,
    firstName,
    lastName,
    role,
    organizationId: new ObjectId(organizationId),
    teamIds: [],
    status: "pending",
    userType: "organization",
    password, // Password will be set during invitation acceptance
  });

  // Create invitation
  const invitation = await invitationsService.create({
    email,
    firstName,
    lastName,
    role,
    organizationId,
    teamIds: [],
  });

  // Send invitation email
  await sendInvitationEmail({
    to: email,
    firstName,
    lastName,
    invitationToken: invitation.token,
    organizationName: org.name,
  });

  res.status(201).json(invitation);
};

export const verifyInvitation = async (req: Request, res: Response) => {
  const { token } = req.params;
  const invitation = await invitationsService.findByToken(token);
  if (!invitation || invitation.status !== "pending")
    return res.status(404).json({ error: "Invalid or expired invitation" });

  const { organizations } = await getCollections();
  const org = await organizations.findOne({ _id: invitation.organizationId });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  res.json({
    email: invitation.email,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    organizationName: org.name,
  });
};

export const acceptInvitation = async (req: Request, res: Response) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!token || !password)
    return res.status(400).json({ error: "Token and password are required" });

  const user = await invitationsService.accept(token, { password });
  if (!user)
    return res.status(500).json({ error: "Failed to create user account" });

  res.json({ message: "Account created successfully", email: user.email });
};

export const resendInvitation = async (req: Request, res: Response) => {
  const { email } = req.body;
  // Find the pending invitation
  const invitation = await invitationsService.resend(email);
  if (!invitation)
    return res.status(404).json({ error: "No pending invitation found" });

  // Fetch org for email content
  const { organizations } = await getCollections();
  const org = await organizations.findOne({ _id: invitation.organizationId });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  // Send invitation email again
  await sendInvitationEmail({
    to: invitation.email,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    invitationToken: invitation.token,
    organizationName: org.name,
  });

  res.json({ message: "Invitation resent successfully" });
};
