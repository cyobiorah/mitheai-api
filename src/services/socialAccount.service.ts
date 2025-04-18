import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// Link a new social account
export const linkAccount = async (data: any) => {
  const { socialAccounts } = await getCollections();

  // Enforce uniqueness: Only one user can link a given platform+platformAccountId
  const existing = await socialAccounts.findOne({
    platform: data.platform,
    platformAccountId: data.platformAccountId,
  });
  if (existing) {
    throw new Error("This social account is already linked to another user.");
  }

  const doc = {
    ...data,
    userId: new ObjectId(data.userId),
    organizationId: data.organizationId
      ? new ObjectId(data.organizationId)
      : undefined,
    teamId: data.teamId ? new ObjectId(data.teamId) : undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await socialAccounts.insertOne(doc);
  return { _id: result.insertedId, ...doc };
};

// List all social accounts for a user (optionally filter by org/team)
export const listAccounts = async ({ userId, organizationId, teamId }: any) => {
  const { socialAccounts } = await getCollections();
  const filter: any = { userId: new ObjectId(userId) };
  if (organizationId) filter.organizationId = new ObjectId(organizationId);
  if (teamId) filter.teamId = new ObjectId(teamId);
  return socialAccounts.find(filter).toArray();
};

// Update a social account (ownership enforced)
export const updateAccount = async (
  id: string,
  updates: any,
  userId: string
) => {
  const { socialAccounts } = await getCollections();
  const account = await socialAccounts.findOne({ _id: new ObjectId(id) });
  if (!account || String(account.userId) !== userId) return null;

  await socialAccounts.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return socialAccounts.findOne({ _id: new ObjectId(id) });
};

// Get social accounts by organizationId
export const listAccountsByOrganizationId = async (organizationId: string) => {
  const { socialAccounts } = await getCollections();
  return socialAccounts
    .find({ organizationId: new ObjectId(organizationId) })
    .toArray();
};

// Unlink (delete) a social account (ownership enforced)
export const unlinkAccount = async (id: string, userId: string) => {
  const { socialAccounts } = await getCollections();
  const account = await socialAccounts.findOne({ _id: new ObjectId(id) });
  if (!account || String(account.userId) !== userId) return false;
  await socialAccounts.deleteOne({ _id: new ObjectId(id) });
  return true;
};
