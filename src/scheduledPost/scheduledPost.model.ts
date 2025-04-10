import { ObjectId } from "mongodb";

export interface ScheduledPost {
  _id?: ObjectId;
  content: string;
  mediaUrls?: string[];
  platforms: {
    platformId: string;
    accountId: string;
    status: "pending" | "published" | "failed";
    publishedAt?: Date;
    errorMessage?: string;
  }[];
  scheduledFor: Date; // UTC time
  createdBy: string;
  teamId?: string;
  organizationId?: string;
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  scheduledPostId?: string;
  mediaType: string;
}
