import { Request, Response } from "express";
import { RepositoryFactory } from "../repositories/repository.factory";
import { ScheduledPost } from "./scheduledPost.model";
import { fromUTC, toUTC } from "../shared/dateUtils";

export class ScheduledPostController {
  // Create a new scheduled post
  static async createScheduledPost(req: Request, res: Response) {
    try {
      const {
        content,
        mediaUrls,
        platforms,
        scheduledFor,
        teamId,
        organizationId,
        mediaType,
      } = req.body;
      const userId = (req as any).user.uid;

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      // Convert scheduled time to UTC
      const scheduledTimeUTC = toUTC(new Date(scheduledFor));

      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();

      const newScheduledPost: Omit<ScheduledPost, "_id"> = {
        content,
        mediaUrls: mediaUrls || [],
        platforms: platforms.map((platform: any) => ({
          platformId: platform.platformId,
          accountId: platform.accountId,
          status: "pending",
        })),
        scheduledFor: scheduledTimeUTC,
        createdBy: userId,
        teamId,
        organizationId,
        status: "scheduled",
        createdAt: new Date(),
        updatedAt: new Date(),
        mediaType,
      };

      const createdPost = await scheduledPostRepository.create(
        newScheduledPost
      );

      return res.status(201).json({
        status: "success",
        data: createdPost,
      });
    } catch (error: any) {
      console.error("Error creating scheduled post:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to create scheduled post",
      });
    }
  }

  // Get all scheduled posts for a user
  static async getScheduledPosts(req: Request, res: Response) {
    try {
      const userId = (req as any).user.uid;
      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      const { status, platform, startDate, endDate } = req.query;

      const filter: any = { createdBy: userId };

      if (status) {
        filter.status = status;
      }

      if (platform) {
        filter["platforms.platformId"] = platform;
      }

      if (startDate || endDate) {
        filter.scheduledFor = {};
        if (startDate) {
          filter.scheduledFor.$gte = new Date(startDate as string);
        }
        if (endDate) {
          filter.scheduledFor.$lte = new Date(endDate as string);
        }
      }

      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();
      const posts = await scheduledPostRepository.find(filter, {
        scheduledFor: 1,
      });

      // Get account details for each post
      const socialAccountRepository =
        await RepositoryFactory.createSocialAccountRepository();

      const enrichedPosts = await Promise.all(
        posts.map(async (post) => {
          const enrichedPlatforms = await Promise.all(
            post.platforms.map(async (platform) => {
              try {
                const account = await socialAccountRepository.findById(
                  platform.accountId
                );
                return {
                  ...platform,
                  accountName: account?.accountName ?? "Unknown Account",
                  account,
                };
              } catch (error) {
                return {
                  ...platform,
                  accountName: "Unknown Account",
                  account: null,
                };
              }
            })
          );

          return {
            ...post,
            platforms: enrichedPlatforms,
            // Convert UTC time to user's timezone
            scheduledForDisplay: fromUTC(
              post.scheduledFor,
              (req as any).user.timezone
            ),
          };
        })
      );

      return res.status(200).json({
        status: "success",
        data: enrichedPosts,
      });
    } catch (error: any) {
      console.error("Error fetching scheduled posts:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch scheduled posts",
      });
    }
  }

  // Update a scheduled post
  static async updateScheduledPost(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const { content, mediaUrls, platforms, scheduledFor, status } = req.body;
      const userId = (req as any).user.uid;

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();

      // Get the post to check ownership
      const post = await scheduledPostRepository.findById(postId);

      if (!post) {
        return res.status(404).json({
          status: "error",
          message: "Scheduled post not found",
        });
      }

      // Check if the user owns the post
      if (post.createdBy !== userId) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to update this post",
        });
      }

      // Check if the post is already published or in progress
      if (post.status !== "scheduled" && post.status !== "failed") {
        return res.status(400).json({
          status: "error",
          message:
            "Cannot update a post that is already being processed or completed",
        });
      }

      const updateData: Partial<ScheduledPost> = {
        updatedAt: new Date(),
      };

      if (content) updateData.content = content;
      if (mediaUrls) updateData.mediaUrls = mediaUrls;
      if (platforms) updateData.platforms = platforms;
      updateData.status = "scheduled";
      if (updateData.platforms && updateData.platforms.length > 0) {
        updateData.platforms[0].status = "pending";
      }

      if (scheduledFor) {
        updateData.scheduledFor = toUTC(new Date(scheduledFor));
      }

      console.log({ updateData });

      const updatedPost = await scheduledPostRepository.update(
        postId,
        updateData
      );

      return res.status(200).json({
        status: "success",
        data: updatedPost,
      });
    } catch (error: any) {
      console.error("Error updating scheduled post:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to update scheduled post",
      });
    }
  }

  // Get a scheduled post by ID
  static async getScheduledPostById(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const userId = (req as any).user.uid;

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();
      const post = await scheduledPostRepository.findById(postId);

      if (!post) {
        return res.status(404).json({
          status: "error",
          message: "Scheduled post not found",
        });
      }

      // Check if the user owns the post
      if (post.createdBy !== userId) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to view this post",
        });
      }

      return res.status(200).json({
        status: "success",
        data: post,
      });
    } catch (error: any) {
      console.error("Error fetching scheduled post:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to fetch scheduled post",
      });
    }
  }

  // Delete a scheduled post
  static async deleteScheduledPost(req: Request, res: Response) {
    try {
      const { postId } = req.params;
      const userId = (req as any).user.uid;

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      const scheduledPostRepository =
        await RepositoryFactory.createScheduledPostRepository();

      // Get the post to check ownership
      const post = await scheduledPostRepository.findById(postId);

      if (!post) {
        return res.status(404).json({
          status: "error",
          message: "Scheduled post not found",
        });
      }

      // Check if the user owns the post
      if (post.createdBy !== userId) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to delete this post",
        });
      }

      // Check if the post is already published or in progress
      if (post.status === "processing") {
        return res.status(400).json({
          status: "error",
          message: "Cannot delete a post that is currently being processed",
        });
      }

      await scheduledPostRepository.delete(postId);

      return res.status(200).json({
        status: "success",
        message: "Scheduled post deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting scheduled post:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Failed to delete scheduled post",
      });
    }
  }
}
