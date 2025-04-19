import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

export const getPosts = async (req: any, res: any) => {
  const { userId, platform, status, teamId, organizationId } = req.params;
  const { socialposts } = await getCollections();

  // Build query filter
  const filter: any = {};
  if (userId) filter.userId = new ObjectId(userId);
  if (platform) filter.platform = platform;
  if (status) filter.status = status;
  if (teamId) filter.teamId = new ObjectId(teamId);
  if (organizationId) filter.organizationId = new ObjectId(organizationId);

  const posts = await socialposts
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ data: posts, total: posts.length });
};

export const deletePost = async (req: any, res: any) => {
  const { id } = req.params;
  const { socialposts } = await getCollections();
  const result = await socialposts.deleteOne({ _id: new ObjectId(id) });
  res.json({ data: result });
};
