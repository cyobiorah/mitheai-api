import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { getCollections } from "../config/db";

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
}) => {
  const { invitations } = await getCollections();
  const token = uuidv4();
  const expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  );

  const invitationDoc = {
    email,
    firstName,
    lastName,
    role,
    organizationId: new ObjectId(organizationId),
    teamIds: teamIds.map((id) => new ObjectId(id)),
    token,
    status: "pending",
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await invitations.insertOne(invitationDoc);
  return invitationDoc;
};

export const findByToken = async (token: string) => {
  const { invitations } = await getCollections();
  return invitations.findOne({ token });
};

export const accept = async (
  token: string,
  { password }: { password: string }
) => {
  const { invitations } = await getCollections();
  const invitation = await invitations.findOne({ token, status: "pending" });
  if (!invitation) throw new Error("Invalid or expired invitation");
  if (new Date(invitation.expiresAt) < new Date()) {
    await invitations.updateOne(
      { _id: invitation._id },
      { $set: { status: "cancelled", updatedAt: new Date() } }
    );
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
  const { users } = await getCollections();
  const user = await users.findOne({
    email: invitation.email,
    organizationId: invitation.organizationId,
    status: "pending",
  });

  if (!user) throw new Error("User not found");

  // Set password and activate user
  const hashedPassword = await bcrypt.hash(password, 10);
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        password: hashedPassword,
        status: "active",
        updatedAt: new Date(),
      },
    }
  );

  // Update invitation status
  await invitations.updateOne(
    { _id: invitation._id },
    {
      $set: {
        status: "accepted",
        updatedAt: new Date(),
      },
    }
  );

  return await users.findOne(
    { _id: user._id },
    { projection: { password: 0 } }
  );
};

export const resend = async (email: string) => {
  const { invitations } = await getCollections();
  const invitation = await invitations.findOne({ email, status: "pending" });
  if (!invitation) return null;

  // Optionally: generate a new token and expiry
  const newToken = uuidv4();
  const newExpiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000
  );
  await invitations.updateOne(
    { _id: invitation._id },
    {
      $set: { token: newToken, expiresAt: newExpiresAt, updatedAt: new Date() },
    }
  );

  return await invitations.findOne({ _id: invitation._id });
};
