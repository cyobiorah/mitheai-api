// import { ObjectId } from "mongodb";
// import { getCollections } from "../config/db";

// export const getPosts = async (req: any, res: any) => {
//   const { userId, platform, status, teamId, organizationId } = req.params;
//   const { socialposts } = await getCollections();

//   // Build query filter
//   const filter: any = {};
//   if (userId) filter.userId = new ObjectId(userId);
//   if (platform) filter.platform = platform;
//   if (status) filter.status = status;
//   if (teamId) filter.teamId = new ObjectId(teamId);
//   if (organizationId) filter.organizationId = new ObjectId(organizationId);

//   const posts = await socialposts
//     .find(filter)
//     .sort({ createdAt: -1 })
//     .toArray();
//   res.json({ data: posts, total: posts.length });
// };

// export const deletePost = async (req: any, res: any) => {
//   const { id } = req.params;
//   const { socialposts } = await getCollections();
//   const result = await socialposts.deleteOne({ _id: new ObjectId(id) });
//   res.json({ data: result });
// };

// // Get personal posts
// export const getPersonalPosts = async (req: any, res: any) => {
//   const { accountId } = req.params;
//   const { socialposts } = await getCollections();
//   const posts = await socialposts
//     .find({ accountId: new ObjectId(accountId) })
//     .sort({ createdAt: -1 })
//     .toArray();
//   res.json({ data: posts, total: posts.length });
// };

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

// // Post to platform
// export async function postToMultiPlatform({
//   req,
//   res,
// }: {
//   req: Request;
//   res: ExpressResponse;
// }) {
//   try {
//     const media = (req.files ?? []) as Express.Multer.File[];
//     const { postData, dimensions } = req.body;

//     if (
//       !postData ||
//       (JSON.parse(postData)?.mediaType !== "text" && !media?.length)
//     ) {
//       return res.status(400).json({ error: "Missing media or postData" });
//     }

//     const parsed = JSON.parse(postData);

//     console.log({ dimensions });

//     await handlePlatformUploadAndPost({
//       platform: parsed.platform,
//       mediaFiles: media,
//       userId: (req as any).user.id,
//       postMeta: {
//         accountId: parsed.accountId,
//         accountName: parsed.accountName,
//         accountType: parsed.accountType,
//         caption: parsed.caption,
//         mediaType: parsed.mediaType,
//         platformAccountId: parsed.platformAccountId,
//         accessToken: parsed.accessToken,
//         dimensions,
//       },
//       res,
//     });

//     // if (!result.success) {
//     //   return res.status(500).json({ error: result.error });
//     // }

//     // res.status(200).json({ postId: result.postId });
//   } catch (err: any) {
//     console.error("Post to platform failed:", err);
//     res.status(500).json({ error: err.message });
//   }
// }

export async function postToMultiPlatform({
  req,
  res,
}: {
  req: Request;
  res: ExpressResponse;
}) {
  try {
    const media = (req.files ?? []) as Express.Multer.File[];
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

    console.log("Parsed dimensions:", parsedDimensions);

    await handlePlatformUploadAndPost({
      platform: parsedPostData.platform,
      mediaFiles: media,
      userId: (req as any).user.id,
      postMeta: {
        accountId: parsedPostData.accountId,
        accountName: parsedPostData.accountName,
        accountType: parsedPostData.accountType,
        caption: parsedPostData.caption,
        mediaType: parsedPostData.mediaType,
        platformAccountId: parsedPostData.platformAccountId,
        accessToken: parsedPostData.accessToken,
        dimensions: parsedDimensions,
      },
      res,
    });
  } catch (err: any) {
    console.error("Post to platform failed:", err);
    res.status(500).json({ error: err.message });
  }
}
