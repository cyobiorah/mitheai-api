import { ObjectId } from "mongodb";

export interface SocialPost {
  _id?: string | ObjectId;
  userId: string;
  teamId?: string;
  organizationId?: string;
  socialAccountId: string;
  platform: string; // 'linkedin', 'threads', etc.
  content: string;
  mediaType: string; // 'TEXT', 'IMAGE', 'VIDEO', etc.
  mediaUrls?: string[];
  postId?: string; // ID returned by the platform
  postUrl?: string; // Link to the post on the platform
  status: "published" | "failed" | "scheduled";
  scheduledDate?: Date;
  publishedDate?: Date;
  errorMessage?: string;

  // Analytics fields
  impressions?: number;
  engagements?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;

  // Metadata
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
