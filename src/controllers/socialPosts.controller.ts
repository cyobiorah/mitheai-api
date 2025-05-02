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

import { Request, Response } from "express";
import * as SocialPostsService from "../services/socialPosts.service";

// Get posts (with flexible filtering)
export const getPosts = async (req: Request, res: Response) => {
  try {
    const { userId, teamId, organizationId } = req.query;

    // Only apply one type of ownership filter at a time for strictness
    let posts: any = [];
    if (userId) {
      posts = await SocialPostsService.getSocialPostsByUserId(userId as string);
    } else if (teamId) {
      posts = await SocialPostsService.getSocialPostsByTeamId(teamId as string);
    } else if (organizationId) {
      posts = await SocialPostsService.getSocialPostsByOrganizationId(
        organizationId as string
      );
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
export const getPostsByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const posts = await SocialPostsService.getSocialPostsByUserId(userId);
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by user" });
  }
};

// Get posts by teamId
export const getPostsByTeamId = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const posts = await SocialPostsService.getSocialPostsByTeamId(teamId);
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by team" });
  }
};

// Get posts by organizationId
export const getPostsByOrganizationId = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const posts = await SocialPostsService.getSocialPostsByOrganizationId(
      organizationId
    );
    res.json({ data: posts, total: posts.length });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message ?? "Failed to get posts by organization" });
  }
};

// Get a single post by ID
export const getPostById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const post = await SocialPostsService.getSocialPostById(id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to get post" });
  }
};

// Create a new post
export const createPost = async (req: Request, res: Response) => {
  try {
    const post = await SocialPostsService.createSocialPost(req.body);
    res.status(201).json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to create post" });
  }
};

// Update a post
export const updatePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const post = await SocialPostsService.updateSocialPost(id, req.body);
    res.json({ data: post });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to update post" });
  }
};

// Delete a post
export const deletePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await SocialPostsService.deleteSocialPost(id);
    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Failed to delete post" });
  }
};
