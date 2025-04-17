import Invitation, { IInvitation } from "../models/invitations.model";
import User from "../models/user.model";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

const INVITATION_EXPIRY_HOURS = 48;

export const create = async ({
  email,
  firstName,
  lastName,
  role,
  organizationId,
  teamIds = [],
}: {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  teamIds?: string[];
}): Promise<IInvitation> => {
  const token = uuidv4();
  const expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const invitation = await Invitation.create({
    email,
    firstName,
    lastName,
    role,
    organizationId,
    teamIds,
    token,
    status: "pending",
    expiresAt,
  });

  return invitation;
};

export const findByToken = async (token: string) => {
  return Invitation.findOne({ token });
};

export const accept = async (
  token: string,
  { password }: { password: string }
) => {
  const invitation = await Invitation.findOne({ token, status: "pending" });
  if (!invitation) throw new Error("Invalid or expired invitation");
  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = "cancelled";
    await invitation.save();
    throw new Error("Invitation has expired");
  }

  //   // Check if user already exists
  //   const existing = await User.findOne({
  //     email: invitation.email,
  //     organizationId: invitation.organizationId,
  //   });
  //   if (existing) throw new Error("User already exists");

  //   // Create user
  //   const hashedPassword = await bcrypt.hash(password, 10);
  //   const user = await User.create({
  //     email: invitation.email,
  //     firstName: invitation.firstName,
  //     lastName: invitation.lastName,
  //     role: invitation.role,
  //     organizationId: invitation.organizationId,
  //     teamIds: invitation.teamIds,
  //     password: hashedPassword,
  //     status: "active",
  //     userType: "organization",
  //   });

  //   Find the invited user in the organization
  const user = await User.findOne({
    email: invitation.email,
    organizationId: invitation.organizationId,
    status: "pending",
  });

  if (!user) throw new Error("User not found");

  //   Set password and activate user
  user.password = await bcrypt.hash(password, 10);
  user.status = "active";
  await user.save();

  // Update invitation status
  invitation.status = "accepted";
  await invitation.save();

  return user;
};

export const resend = async (email: string) => {
  const invitation = await Invitation.findOne({ email, status: "pending" });
  if (!invitation) return null;

  // Optionally: generate a new token and expiry
  invitation.token = uuidv4();
  invitation.expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  );
  await invitation.save();

  return invitation;
};
