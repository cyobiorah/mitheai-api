import { ObjectId } from "mongodb";

export interface ScheduledPost {
  _id?: ObjectId;
  createdBy: string;
  teamId?: string;
  organizationId?: string;
  content: string;
  mediaUrls?: string[];
  scheduledFor: Date; // UTC time
  // scheduledInTimezone: string;
  timezone: string;
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  errorMessage?: string;
  platforms: {
    platformId: string;
    accountId: string;
    status: "pending" | "published" | "failed";
    publishedAt?: Date;
    errorMessage?: string;
  }[];
  scheduledPostId?: ObjectId;
  mediaType: string;
  createdAt: Date;
  updatedAt: Date;
}
