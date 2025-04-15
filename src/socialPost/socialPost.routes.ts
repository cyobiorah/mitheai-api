import express from "express";
import { authenticateToken } from "../auth/auth.middleware";
import { RepositoryFactory } from "../repositories/repository.factory";
import { isOrganizationUser } from "../appTypes";

const router = express.Router();

// Get all posts for the authenticated user
router.get("/posts", authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user?.uid;
    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const { platform, status, startDate, endDate, sortBy, sortOrder } =
      req.query;

    // Create filter object
    const filter: any = { userId };

    // Add optional filters
    if (platform) {
      filter.platform = platform;
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.publishedDate = {};
      if (startDate) {
        filter.publishedDate.$gte = new Date(startDate as string);
      }
      if (endDate) {
        filter.publishedDate.$lte = new Date(endDate as string);
      }
    }

    // Get the repository
    const socialPostRepository =
      await RepositoryFactory.createSocialPostRepository();

    // Get posts with sorting
    const sortOptions: any = {};
    if (sortBy) {
      sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1;
    } else {
      // Default sort by publishedDate descending
      sortOptions.publishedDate = -1;
    }

    const posts = await socialPostRepository.getPosts(filter, sortOptions);

    // Get account details for each post
    const socialAccountRepository =
      await RepositoryFactory.createSocialAccountRepository();

    // Enrich posts with account details
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        try {
          const account = await socialAccountRepository.findById(
            post.socialAccountId.toString()
          );
          return {
            ...post,
            accountName: account?.accountName ?? "Unknown Account",
            // accountAvatar: account?.profileImageUrl ?? null,
            account,
          };
        } catch (error) {
          return {
            ...post,
            accountName: "Unknown Account",
            account: null,
          };
        }
      })
    );

    return res.status(200).json({
      status: "success",
      data: enrichedPosts,
    });
  } catch (error: any) {
    console.error("Error fetching social posts:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to fetch social posts",
    });
  }
});

// Delete a post
router.delete("/posts/:postId", authenticateToken, async (req: any, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const socialPostRepository =
      await RepositoryFactory.createSocialPostRepository();

    // Get the post to check ownership
    const post = await socialPostRepository.getPostById(postId);

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    // Check if the user owns the post or has admin rights
    if (post.userId !== userId) {
      const user = req.user;

      const hasAccess =
        (post.organizationId &&
          isOrganizationUser(user) &&
          post.organizationId.toString() === user.organizationId) ||
        (post.teamId &&
          isOrganizationUser(user) &&
          user.teamIds?.includes(post.teamId.toString())) ||
        user.role === "super_admin";

      if (!hasAccess) {
        return res.status(403).json({
          status: "error",
          message: "You do not have permission to delete this post",
        });
      }
    }

    // Delete the post
    await socialPostRepository.deletePost(postId);

    return res.status(200).json({
      status: "success",
      message: "Post deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting social post:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Failed to delete social post",
    });
  }
});

export default router;
