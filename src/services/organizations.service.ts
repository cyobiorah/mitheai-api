import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

export const createOrganization = async (data: any) => {
  const { organizations } = await getCollections();
  // Add owner as first member
  const orgData = {
    ...data,
    members: [data.ownerId],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await organizations.insertOne(orgData);
  return { _id: result.insertedId, ...orgData };
};

export const updateOrganization = async (
  orgId: string,
  update: any,
  userId: string
) => {
  const { organizations } = await getCollections();
  const org = await organizations.findOne({ _id: new ObjectId(orgId) });
  if (!org) return null;
  // Only owner can update
  if (org.ownerId.toString() !== userId) return null;
  await organizations.updateOne(
    { _id: new ObjectId(orgId) },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return organizations.findOne({ _id: new ObjectId(orgId) });
};

export const getOrganizationById = async (orgId: string) => {
  const { organizations } = await getCollections();
  return organizations.findOne({ _id: new ObjectId(orgId) });
};

export const deleteOrganization = async (orgId: string, userId: string) => {
  const { organizations } = await getCollections();
  const org = await organizations.findOne({ _id: new ObjectId(orgId) });
  if (!org) return false;
  if (org.ownerId.toString() !== userId) return false;
  await organizations.deleteOne({ _id: new ObjectId(orgId) });
  return true;
};
