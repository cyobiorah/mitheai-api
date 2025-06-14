import { Request, Response as ExpressResponse } from "express";
import {
  getSocialPostsByUserId,
  getSocialPostsByTeamId,
  getSocialPostsByOrganizationId,
  getSocialPostById,
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  handlePlatformUploadAndPost,
} from "../services/socialPosts.service";
import { getCollections } from "../config/db";

// Get posts (with flexible filtering)
export const getPosts = async (req: Request, res: ExpressResponse) => {
  try {
    const { userId, teamId, organizationId } = req.query;

    // Only apply one type of ownership filter at a time for strictness
    let posts: any = [];
    if (userId) {
      posts = await getSocialPostsByUserId(userId as string);
    } else if (teamId) {
      posts = await getSocialPostsByTeamId(teamId as string);
    } else if (organizationId) {
      posts = await getSocialPostsByOrganizationId(organizationId as string);
    } else {
      // Optionally, you could return [] or an error if no owner filter is provided
      posts = [];
    }

    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to get posts" });
  }
};

// Get posts by userId
export const getPostsByUserId = async (req: Request, res: ExpressResponse) => {
  try {
    const { userId } = req.params;
    const posts = await getSocialPostsByUserId(userId);
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by user" });
  }
};

// Get posts by teamId
export const getPostsByTeamId = async (req: Request, res: ExpressResponse) => {
  try {
    const { teamId } = req.params;
    const posts = await getSocialPostsByTeamId(teamId);
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by team" });
  }
};

// Get posts by organizationId
export const getPostsByOrganizationId = async (
  req: Request,
  res: ExpressResponse
) => {
  try {
    const { organizationId } = req.params;
    const posts = await getSocialPostsByOrganizationId(organizationId);
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by organization" });
  }
};

// Get a single post by ID
export const getPostById = async (req: Request, res: ExpressResponse) => {
  try {
    const { id } = req.params;
    const post = await getSocialPostById(id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to get post" });
  }
};

// Create a new post
export const createPost = async (req: Request, res: ExpressResponse) => {
  try {
    const post = await createSocialPost(req.body);
    res.status(201).json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to create post" });
  }
};

// Update a post
export const updatePost = async (req: Request, res: ExpressResponse) => {
  try {
    const { id } = req.params;
    const post = await updateSocialPost(id, req.body);
    res.json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to update post" });
  }
};

// Delete a post
export const deletePost = async (req: Request, res: ExpressResponse) => {
  try {
    const { id } = req.params;
    const result = await deleteSocialPost(id);
    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to delete post" });
  }
};

export async function postToMultiPlatform({
  req,
  res,
}: {
  req: Request;
  res: ExpressResponse;
}) {
  try {
    const media = ((req as any).files?.["media"] ??
      []) as Express.Multer.File[];
    const { postData, dimensions } = req.body;

    if (
      !postData ||
      (JSON.parse(postData)?.mediaType !== "text" && !media?.length)
    ) {
      return res.status(400).json({ error: "Missing media or postData" });
    }

    const parsedPostData = JSON.parse(postData);

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

    const { socialaccounts } = await getCollections();

    let account;
    if (parsedPostData.scheduledFor) {
      account = await socialaccounts.findOne({
        accountId: parsedPostData.platforms[0].accountId,
        platform: parsedPostData.platforms[0].platform,
      });
    } else {
      account = await socialaccounts.findOne({
        accountId: parsedPostData.accountId,
        platform: parsedPostData.platform,
      });
    }

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    await handlePlatformUploadAndPost({
      platform: account.platform,
      mediaFiles: media,
      userId: (req as any).user.id,
      postMeta: {
        accountId: account.accountId,
        accountName: account.accountName,
        accountType: account.accountType,
        caption: parsedPostData.caption ?? parsedPostData.content,
        mediaType: parsedPostData.mediaType,
        accessToken: account.accessToken,
        dimensions: parsedDimensions,
        ...(parsedPostData.scheduledFor && {
          scheduledFor: parsedPostData.scheduledFor,
        }),
        ...(parsedPostData.timezone && {
          timezone: parsedPostData.timezone,
        }),
        ...(account.platform === "tiktok" && {
          tiktokAccountOptions: parsedPostData.tiktokAccountOptions,
        }),
      },
      res,
    });
  } catch (err: any) {
    console.error("Post to platform failed:", err);
    res.status(500).json({ error: err.message });
  }
}
