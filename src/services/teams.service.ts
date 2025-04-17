import Team from "../models/team.model";
import User from "../models/user.model";
import { Types } from "mongoose";

// Create a new team (creator is first member)
export const createTeam = async (data: any) => {
  const { name, description, organizationId, creatorId } = data;
  // Optionally add more validation here

  const team = new Team({
    name,
    description,
    organizationId,
    memberIds: [creatorId],
    settings: { permissions: ["basic"] },
  });
  await team.save();

  // Add team to creator's teamIds
  await User.findByIdAndUpdate(creatorId, { $addToSet: { teamIds: team._id } });

  return team;
};

// Get all teams for an organization
export const getTeamsByOrganization = async (organizationId: string) => {
  return Team.find({ organizationId });
};

// Get a single team by ID
export const getTeamById = async (teamId: string) => {
  return Team.findById(teamId);
};

// Update a team (only org owner or team member can update)
export const updateTeam = async (
  teamId: string,
  updates: any,
  userId: string
) => {
  const team = await Team.findById(teamId);
  if (!team) return null;

  // Only team member or org owner can update
  if (!team.memberIds.map(String).includes(userId)) return null;

  Object.assign(team, updates);
  await team.save();
  return team;
};

// Delete a team (only org owner or team member can delete)
export const deleteTeam = async (teamId: string, userId: string) => {
  const team = await Team.findById(teamId);
  if (!team) return false;

  // Only team member or org owner can delete
  if (!team.memberIds.map(String).includes(userId)) return false;

  // Remove this team from all members' teamIds
  await User.updateMany(
    { teamIds: team._id },
    { $pull: { teamIds: team._id } }
  );

  await team.deleteOne();
  return true;
};

// Add a member to a team (only team member or org owner can add)
export const addTeamMember = async (
  teamId: string,
  userId: string,
  actingUserId: string
) => {
  const team = await Team.findById(teamId);
  if (!team) return null;

  // Only team member or org owner can add
  if (!team.memberIds.map(String).includes(actingUserId)) return null;

  if (team.memberIds.map(String).includes(userId)) return null; // Already a member

  team.memberIds.push(new Types.ObjectId(userId));
  await team.save();

  await User.findByIdAndUpdate((userId), { $addToSet: { teamIds: team._id } });

  return team;
};

// Remove a member from a team (only team member or org owner can remove)
export const removeTeamMember = async (
  teamId: string,
  userId: string,
  actingUserId: string
) => {
  const team = await Team.findById(teamId);
  if (!team) return null;

  // Only team member or org owner can remove
  if (!team.memberIds.map(String).includes(actingUserId)) return null;

  if (!team.memberIds.map(String).includes(userId)) return null; // Not a member

  team.memberIds = team.memberIds.filter((id: any) => String(id) !== userId);
  await team.save();

  await User.findByIdAndUpdate(userId, { $pull: { teamIds: team._id } });

  return team;
};
