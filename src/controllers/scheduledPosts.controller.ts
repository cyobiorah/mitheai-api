import { Request, Response as ExpressResponse } from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";
import { toUTC } from "../utils/dateUtils";
import { handleTransformAndUpload } from "../services/socialPosts.service";

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

// Get logged in users scheduled posts
export const getLoggedInUsersScheduledPosts = async (req: any, res: any) => {
  const userId = req.user.id;
  const { scheduledposts } = await getCollections();

  const posts = await scheduledposts
    .find({ createdBy: new ObjectId(userId) })
    .sort({ scheduledFor: 1 })
    .toArray();

  res.json({ data: posts, count: posts.length });
};

// Create scheduled post
export const createScheduledPost = async ({
  req,
  res,
}: {
  req: Request;
  res: ExpressResponse;
}) => {
  try {
    const media = ((req as any).files?.["media"] ??
      []) as Express.Multer.File[];
    const { postData, dimensions } = req.body;
    const userId = (req as any).user.id;

    if (
      !postData ||
      (JSON.parse(postData)?.mediaType !== "text" && !media?.length)
    ) {
      return res.status(400).json({ error: "Missing media or postData" });
    }

    // dimensions[] comes as an array of JSON strings, parse each
    const parsedDimensions: { id: string; width: number; height: number }[] =
      Array.isArray(dimensions)
        ? dimensions
            .map((d: string) => {
              try {
                return JSON.parse(d);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [];

    const parsedPostData = JSON.parse(postData);

    // Convert scheduled time to UTC
    const scheduledTimeUTC = toUTC(new Date(parsedPostData.scheduledFor));

    // Prepare platforms array
    const platformsArray = parsedPostData.platforms.map((platform: any) => ({
      platform: platform.platform,
      accountId: platform.accountId,
      status: "pending",
    }));

    const mediaUrls = await handleTransformAndUpload({
      mediaFiles: media,
      postMeta: {
        dimensions: parsedDimensions,
      },
      platform: "general",
    });

    const { scheduledposts } = await getCollections();

    const newScheduledPost = {
      content: parsedPostData.content,
      mediaUrls: mediaUrls ?? [],
      platforms: platformsArray,
      scheduledFor: scheduledTimeUTC,
      createdBy: new ObjectId(userId),
      userId: new ObjectId(userId),
      teamId: parsedPostData.teamId
        ? new ObjectId(parsedPostData.teamId)
        : undefined,
      organizationId: parsedPostData.organizationId
        ? new ObjectId(parsedPostData.organizationId)
        : undefined,
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
      mediaType: parsedPostData.mediaType,
      timezone: parsedPostData.timezone,
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
  const updates = {
    ...req.body,
    updatedAt: new Date(),
    scheduledFor: toUTC(new Date(req.body.scheduledFor)),
  };
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

// Get single scheduled post
export const getSingleScheduledPost = async (req: any, res: any) => {
  const { scheduledposts } = await getCollections();
  const { id } = req.params;
  const post = await scheduledposts.findOne({ _id: new ObjectId(id) });
  if (!post) {
    return res.status(404).json({
      status: "error",
      message: "Scheduled post not found",
    });
  }
  res.json({ success: true, data: post });
};
