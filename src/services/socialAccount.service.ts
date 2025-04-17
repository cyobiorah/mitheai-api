import SocialAccount from "../models/socialAccount.model";
import { Types } from "mongoose";

// Link a new social account
export const linkAccount = async (data: any) => {
  // userId is always required
  const socialAccount = new SocialAccount(data);
  await socialAccount.save();
  return socialAccount;
};

// List all social accounts for a user (optionally filter by org/team)
export const listAccounts = async ({ userId, organizationId, teamId }: any) => {
  const filter: any = { userId: new Types.ObjectId(userId) };
  if (organizationId)
    filter.organizationId = new Types.ObjectId(organizationId);
  if (teamId) filter.teamId = new Types.ObjectId(teamId);
  return SocialAccount.find(filter);
};

// Update a social account (ownership enforced)
export const updateAccount = async (
  id: string,
  updates: any,
  userId: string
) => {
  const account = await SocialAccount.findById(id);
  if (!account || String(account.userId) !== userId) return null;
  Object.assign(account, updates);
  await account.save();
  return account;
};

// Get social accounts by organizationId
export const listAccountsByOrganizationId = async (organizationId: string) => {
  console.log({ organizationId });
  //   const filter: any = { organizationId: new Types.ObjectId(organizationId) };
  //   return SocialAccount.find(filter);

  const accounts = await SocialAccount.find({
    organizationId,
  });
  return accounts;
};

// Unlink (delete) a social account (ownership enforced)
export const unlinkAccount = async (id: string, userId: string) => {
  const account = await SocialAccount.findById(id);
  if (!account || String(account.userId) !== userId) return false;
  await account.deleteOne();
  return true;
};
