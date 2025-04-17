import Organization from "../models/organization.model";

export const createOrganization = async (data: any) => {
  // Assume data contains ownerId, name, type, description, settings, etc.
  const org = new Organization({
    ...data,
    members: [data.ownerId], // Optionally add owner as first member
  });
  await org.save();
  return org;
};

export const updateOrganization = async (
  orgId: string,
  update: any,
  userId: string
) => {
  const org = await Organization.findById(orgId);
  if (!org) return null;
  // Only owner can update
  if (org.ownerId.toString() !== userId) return null;
  Object.assign(org, update);
  await org.save();
  return org;
};

export const getOrganizationById = async (orgId: string) => {
  return Organization.findById(orgId);
};

export const deleteOrganization = async (orgId: string, userId: string) => {
  const org = await Organization.findById(orgId);
  if (!org) return false;
  if (org.ownerId.toString() !== userId) return false;
  await org.deleteOne();
  return true;
};
