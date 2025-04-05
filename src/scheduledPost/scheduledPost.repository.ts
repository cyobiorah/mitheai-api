// src/socialPost/scheduledPost.repository.ts
import { Db } from "mongodb";
import { MongoDBRepository } from "../repositories/mongodb.repository";
import { isValidObjectId } from "../shared/objectId";
import { ScheduledPost } from "./scheduledPost.model";

export class ScheduledPostRepository extends MongoDBRepository<ScheduledPost> {
  constructor(db: Db) {
    super(db, "scheduledPosts");
  }

  /**
   * Find scheduled posts that are due for publishing
   * @param now Current date
   * @returns Array of scheduled posts
   */
  async findDue(now: Date): Promise<ScheduledPost[]> {
    return await this.find({
      scheduledFor: { $lte: now },
      status: "scheduled",
    });
  }

  /**
   * Find scheduled posts by user
   * @param userId User ID
   * @returns Array of scheduled posts
   */
  async findByUser(userId: string): Promise<ScheduledPost[]> {
    return await this.find({ createdBy: userId });
  }

  /**
   * Find scheduled posts by team
   * @param teamId Team ID
   * @returns Array of scheduled posts
   */
  async findByTeam(teamId: string): Promise<ScheduledPost[]> {
    if (!isValidObjectId(teamId)) {
      console.error(`Invalid ObjectId for team scheduled posts: ${teamId}`);
      return [];
    }
    return await this.find({ teamId });
  }

  /**
   * Find scheduled posts by organization
   * @param organizationId Organization ID
   * @returns Array of scheduled posts
   */
  async findByOrganization(organizationId: string): Promise<ScheduledPost[]> {
    if (!isValidObjectId(organizationId)) {
      console.error(
        `Invalid ObjectId for organization scheduled posts: ${organizationId}`
      );
      return [];
    }
    return await this.find({ organizationId });
  }

  /**
   * Update the status of a scheduled post
   * @param id Post ID
   * @param status New status
   * @param errorMessage Optional error message
   * @returns Updated scheduled post
   */
  async updateStatus(
    id: string,
    status: ScheduledPost["status"],
    errorMessage?: string
  ): Promise<ScheduledPost | null> {
    if (!isValidObjectId(id)) {
      console.error(`Invalid ObjectId for scheduled post status update: ${id}`);
      return null;
    }

    const updateData: Partial<ScheduledPost> = {
      status,
      updatedAt: new Date(),
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    return await this.update(id, updateData);
  }

  /**
   * Update the status of a specific platform in a scheduled post
   * @param id Post ID
   * @param platformId Platform ID
   * @param status New status
   * @param publishedAt Optional published date
   * @param errorMessage Optional error message
   * @returns Updated scheduled post
   */
  async updatePlatformStatus(
    id: string,
    platformId: string,
    status: "pending" | "published" | "failed",
    publishedAt?: Date,
    errorMessage?: string
  ): Promise<ScheduledPost | null> {
    if (!isValidObjectId(id)) {
      console.error(`Invalid ObjectId for platform status update: ${id}`);
      return null;
    }

    const post = await this.findById(id);
    if (!post) return null;

    // Update the specific platform
    const platforms = post.platforms.map((p) => {
      if (p.platformId === platformId) {
        const updated = { ...p, status };
        if (publishedAt) updated.publishedAt = publishedAt;
        if (errorMessage) updated.errorMessage = errorMessage;
        return updated;
      }
      return p;
    });

    return await this.update(id, {
      platforms,
      updatedAt: new Date(),
    });
  }

  /**
   * Create a new scheduled post
   * @param data Scheduled post data
   * @returns Created scheduled post
   */
  async create(data: Omit<ScheduledPost, "_id">): Promise<ScheduledPost> {
    const now = new Date();

    const mongoData = {
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      status: data.status || "scheduled",
    };

    return await super.create(mongoData);
  }

  /**
   * Update a scheduled post
   * @param id Post ID
   * @param data Updated data
   * @returns Updated scheduled post
   */
  async update(
    id: string,
    data: Partial<ScheduledPost>
  ): Promise<ScheduledPost | null> {
    if (!isValidObjectId(id)) {
      console.error(`Invalid ObjectId for scheduled post update: ${id}`);
      return null;
    }

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    return await super.update(id, updateData);
  }
}
