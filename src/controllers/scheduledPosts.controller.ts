import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";
import { toUTC } from "../utils/dateUtils";

// List scheduled posts
export const listScheduledPosts = async (req: any, res: any) => {
  const { userId, organizationId, teamId } = req.query;
  const { scheduledposts } = await getCollections();
  const filter: any = {};
  if (userId) filter.userId = new ObjectId(userId);
  if (organizationId) filter.organizationId = new ObjectId(organizationId);
  if (teamId) filter.teamId = new ObjectId(teamId);

  const posts = await scheduledposts
    .find(filter)
    .sort({ scheduledFor: 1 })
    .toArray();
  res.json({ data: posts, count: posts.length });
};

// Create scheduled post
export const createScheduledPost = async (req: any, res: any) => {
  try {
    const {
      content,
      mediaUrls,
      platforms,
      scheduledFor,
      teamId,
      organizationId,
      mediaType,
      timezone,
    } = req.body;
    console.log({ user: req.user });
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    // Convert scheduled time to UTC
    const scheduledTimeUTC = toUTC(new Date(scheduledFor));

    // Prepare platforms array
    const platformsArray = (platforms ?? []).map((platform: any) => ({
      platformId: platform.platformId,
      accountId: platform.accountId,
      status: "pending",
    }));

    const { scheduledposts } = await getCollections();

    const newScheduledPost = {
      content,
      mediaUrls: mediaUrls ?? [],
      platforms: platformsArray,
      scheduledFor: scheduledTimeUTC,
      createdBy: new ObjectId(userId),
      teamId: teamId ? new ObjectId(teamId) : undefined,
      organizationId: organizationId ? new ObjectId(organizationId) : undefined,
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
      mediaType,
      timezone,
    };

    const result = await scheduledposts.insertOne(newScheduledPost);

    return res.status(201).json({
      status: "success",
      data: { _id: result.insertedId, ...newScheduledPost },
    });
  } catch (error: any) {
    console.error("Error creating scheduled post:", error);
    return res.status(500).json({
      status: "error",
      message: error.message ?? "Failed to create scheduled post",
    });
  }
};
// Update scheduled post
export const updateScheduledPost = async (req: any, res: any) => {
  const { scheduledposts } = await getCollections();
  const { id } = req.params;
  const updates = { ...req.body, updatedAt: new Date() };
  await scheduledposts.updateOne({ _id: new ObjectId(id) }, { $set: updates });
  res.json({ success: true });
};

// Delete scheduled post
export const deleteScheduledPost = async (req: any, res: any) => {
  const { scheduledposts } = await getCollections();
  const { id } = req.params;
  await scheduledposts.deleteOne({ _id: new ObjectId(id) });
  res.json({ success: true });
};
