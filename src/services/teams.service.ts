import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// Create a new team (creator is first member)
export const createTeam = async (data: any) => {
  const { teams, users } = await getCollections();
  const { name, description, organizationId, creatorId } = data;

  const teamDoc = {
    name,
    description,
    organizationId: new ObjectId(organizationId),
    memberIds: [new ObjectId(creatorId)],
    settings: { permissions: ["basic"] },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await teams.insertOne(teamDoc);

  // Add team to creator's teamIds
  await users.updateOne(
    { _id: new ObjectId(creatorId) },
    { $addToSet: { teamIds: result.insertedId } }
  );

  return { _id: result.insertedId, ...teamDoc };
};

// Get all teams for an organization
export const getTeamsByOrganization = async (organizationId: string) => {
  const { teams } = await getCollections();
  return teams.find({ organizationId: new ObjectId(organizationId) }).toArray();
};

// Get a single team by ID
export const getTeamById = async (teamId: string) => {
  const { teams } = await getCollections();
  return teams.findOne({ _id: new ObjectId(teamId) });
};

// Update a team (only org owner or team member can update)
export const updateTeam = async (
  teamId: string,
  updates: any,
  userId: string
) => {
  const { teams } = await getCollections();
  const team = await teams.findOne({ _id: new ObjectId(teamId) });
  if (!team) return null;

  // Only team member or org owner can update
  if (!team.memberIds.map((id: ObjectId) => String(id)).includes(userId))
    return null;

  await teams.updateOne(
    { _id: new ObjectId(teamId) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return teams.findOne({ _id: new ObjectId(teamId) });
};

// Delete a team (only org owner or team member can delete)
export const deleteTeam = async (teamId: string, userId: string) => {
  const { teams, users } = await getCollections();
  const team = await teams.findOne({ _id: new ObjectId(teamId) });
  if (!team) return false;

  // Only team member or org owner can delete
  if (!team.memberIds.map((id: ObjectId) => String(id)).includes(userId))
    return false;

  // Remove this team from all members' teamIds
  await users.updateMany(
    { teamIds: team._id },
    { $pull: { teamIds: team._id as any } }
  );

  await teams.deleteOne({ _id: new ObjectId(teamId) });
  return true;
};

// Add a member to a team (only team member or org owner can add)
export const addTeamMember = async (
  teamId: string,
  userId: string,
  actingUserId: string
) => {
  const { teams, users } = await getCollections();
  const team = await teams.findOne({ _id: new ObjectId(teamId) });
  if (!team) return null;

  // Only team member or org owner can add
  // if (!team.memberIds.map((id: ObjectId) => String(id)).includes(actingUserId))
  //   return null;

  const actingUser = await users.findOne({ _id: new ObjectId(actingUserId) });

  const isTeamMember = team.memberIds
    .map((id: ObjectId) => String(id))
    .includes(actingUserId);
  const isOrgOwner =
    actingUser?.role === "org_owner" &&
    String(actingUser.organizationId) === String(team.organizationId);
  const isSuperAdmin = actingUser?.role === "super_admin";

  // console.log({
  //   actingUserId,
  //   actingUser: actingUser?._id,
  //   actingUserRole: actingUser?.role,
  //   actingUserOrg: actingUser?.organizationId,
  //   teamOrg: team.organizationId,
  //   isTeamMember,
  //   isOrgOwner,
  //   isSuperAdmin,
  // });

  if (!(isTeamMember || isOrgOwner || isSuperAdmin)) return null;

  if (team.memberIds.map((id: ObjectId) => String(id)).includes(userId))
    return null; // Already a member

  await teams.updateOne(
    { _id: new ObjectId(teamId) },
    {
      $addToSet: { memberIds: new ObjectId(userId) },
      $set: { updatedAt: new Date() },
    }
  );

  await users.updateOne(
    { _id: new ObjectId(userId) },
    { $addToSet: { teamIds: new ObjectId(teamId) } }
  );

  return teams.findOne({ _id: new ObjectId(teamId) });
};

// Remove a member from a team (only team member or org owner can remove)
export const removeTeamMember = async (
  teamId: string,
  userId: string,
  actingUserId: string
) => {
  const { teams, users } = await getCollections();
  const team = await teams.findOne({ _id: new ObjectId(teamId) });
  if (!team) return null;

  // Only team member or org owner can remove
  if (!team.memberIds.map((id: ObjectId) => String(id)).includes(actingUserId))
    return null;

  if (!team.memberIds.map((id: ObjectId) => String(id)).includes(userId))
    return null; // Not a member

  await teams.updateOne(
    { _id: new ObjectId(teamId) },
    {
      $pull: { memberIds: new ObjectId(userId) },
      $set: { updatedAt: new Date() },
    }
  );

  await users.updateOne(
    { _id: new ObjectId(userId) },
    { $pull: { teamIds: new ObjectId(teamId) } }
  );

  return teams.findOne({ _id: new ObjectId(teamId) });
};

// Get all teams for a Ids
export const getTeamsByIds = async (teamIds: string[]) => {
  const { teams } = await getCollections();
  return teams
    .find({ _id: { $in: teamIds.map((id) => new ObjectId(id)) } })
    .toArray();
};
