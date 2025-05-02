import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// Get social posts by userId
export async function getSocialPostsByUserId(userId: string) {
  const { socialposts } = await getCollections();
  return socialposts
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .toArray();
}

// Get social posts by teamId
export async function getSocialPostsByTeamId(teamId: string, filter: any = {}) {
  const { socialposts } = await getCollections();
  const query = { ...filter, teamId: new ObjectId(teamId) };
  return socialposts.find(query).sort({ createdAt: -1 }).toArray();
}

// Get social posts by organizationId
export async function getSocialPostsByOrganizationId(
  organizationId: string,
  filter: any = {}
) {
  const { socialposts } = await getCollections();
  const query = { ...filter, organizationId: new ObjectId(organizationId) };
  return socialposts.find(query).sort({ createdAt: -1 }).toArray();
}

// General-purpose social post query
export async function getSocialPosts(filter: any = {}) {
  const { socialposts } = await getCollections();
  // Convert any string IDs to ObjectId
  if (filter.userId) filter.userId = new ObjectId(filter.userId);
  if (filter.teamId) filter.teamId = new ObjectId(filter.teamId);
  if (filter.organizationId)
    filter.organizationId = new ObjectId(filter.organizationId);
  return socialposts.find(filter).sort({ createdAt: -1 }).toArray();
}

// Get a single social post by ID
export async function getSocialPostById(postId: string) {
  const { socialposts } = await getCollections();
  return socialposts.findOne({ _id: new ObjectId(postId) });
}

// Create a new social post
export async function createSocialPost(data: any) {
  const { socialposts } = await getCollections();
  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  const result = await socialposts.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Update a social post
export async function updateSocialPost(postId: string, data: any) {
  const { socialposts } = await getCollections();
  await socialposts.updateOne(
    { _id: new ObjectId(postId) },
    { $set: { ...data, updatedAt: new Date() } }
  );
  return socialposts.findOne({ _id: new ObjectId(postId) });
}

// Delete a social post
export async function deleteSocialPost(postId: string) {
  const { socialposts } = await getCollections();
  return socialposts.deleteOne({ _id: new ObjectId(postId) });
}
