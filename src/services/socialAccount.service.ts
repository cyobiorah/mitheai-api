import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// Link a new social account
export const linkAccount = async (data: any) => {
  const { socialaccounts } = await getCollections();

  // Enforce uniqueness: Only one user can link a given platform+platformAccountId
  const existing = await socialaccounts.findOne({
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
  const result = await socialaccounts.insertOne(doc);
  return { _id: result.insertedId, ...doc };
};

// List all social accounts for a user (optionally filter by org/team)
export const listAccounts = async ({ userId, organizationId, teamId }: any) => {
  const { socialaccounts } = await getCollections();
  const filter: any = { userId: new ObjectId(userId) };
  if (organizationId) filter.organizationId = new ObjectId(organizationId);
  if (teamId) filter.teamId = new ObjectId(teamId);
  return socialaccounts.find(filter).toArray();
};

// Update a social account (ownership enforced)
export const updateAccount = async (
  id: string,
  updates: any,
  userId: string
) => {
  const { socialaccounts } = await getCollections();
  const account = await socialaccounts.findOne({ _id: new ObjectId(id) });
  if (!account || String(account.userId) !== userId) return null;

  await socialaccounts.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return socialaccounts.findOne({ _id: new ObjectId(id) });
};

// Get social accounts by organizationId
export const listAccountsByOrganizationId = async (organizationId: string) => {
  const { socialaccounts } = await getCollections();
  return socialaccounts
    .find({ organizationId: new ObjectId(organizationId) })
    .toArray();
};

// Unlink (delete) a social account (ownership enforced)
export const unlinkAccount = async (id: string, userId: string) => {
  const { socialaccounts } = await getCollections();
  const account = await socialaccounts.findOne({ _id: new ObjectId(id) });
  if (!account || String(account.userId) !== userId) return false;
  await socialaccounts.deleteOne({ _id: new ObjectId(id) });
  return true;
};

// Get personal account
export const getPersonalAccount = async (accountId: string) => {
  const { socialaccounts } = await getCollections();
  return socialaccounts.findOne({ _id: new ObjectId(accountId) });
};

// Assign/Unassign Social Account to Team
export const assignToTeam = async ({
  accountId,
  teamId,
  organizationId,
}: {
  accountId: string;
  teamId: string | null;
  organizationId: string;
}) => {
  const { socialaccounts, teams } = await getCollections();

  // Ensure the account belongs to this org
  const account = await socialaccounts.findOne({
    _id: new ObjectId(accountId),
    organizationId: new ObjectId(organizationId),
  });
  if (!account) return null;

  // If assigning, validate team belongs to org
  if (teamId) {
    const team = await teams.findOne({
      _id: new ObjectId(teamId),
      organizationId: new ObjectId(organizationId),
    });
    if (!team) return null;
  }

  await socialaccounts.updateOne(
    { _id: new ObjectId(accountId) },
    {
      $set: {
        teamId: teamId ? new ObjectId(teamId) : null,
        updatedAt: new Date(),
      },
    }
  );

  return socialaccounts.findOne({ _id: new ObjectId(accountId) });
};

// List social accounts by team
export const listAccountsByTeamId = async (teamId: string) => {
  const { socialaccounts } = await getCollections();
  return socialaccounts.find({ teamId: new ObjectId(teamId) }).toArray();
};
