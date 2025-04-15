// import { ObjectId } from "mongodb";

// export interface SocialPost {
//   _id?: string | ObjectId;
//   userId: string;
//   teamId?: string;
//   organizationId?: string;
//   socialAccountId: string;
//   platform: string; // 'linkedin', 'threads', etc.
//   content: string;
//   mediaType: string; // 'TEXT', 'IMAGE', 'VIDEO', etc.
//   mediaUrls?: string[];
//   postId?: string; // ID returned by the platform
//   postUrl?: string; // Link to the post on the platform
//   status: "published" | "failed" | "scheduled";
//   scheduledDate?: Date;
//   publishedDate?: Date;
//   errorMessage?: string;

//   // Analytics fields
//   impressions?: number;
//   engagements?: number;
//   likes?: number;
//   comments?: number;
//   shares?: number;
//   clicks?: number;

//   // Metadata
//   metadata?: Record<string, any>;
//   createdAt: Date;
//   updatedAt: Date;

//   scheduledPostId?: string;
// }

import { ObjectId } from "mongodb";

export interface SocialPost {
  _id?: ObjectId; // Changed to just ObjectId
  userId: string; // Keep as string if it's not a MongoDB ID
  teamId?: ObjectId; // Changed to ObjectId
  organizationId?: ObjectId; // Changed to ObjectId
  socialAccountId: ObjectId; // Changed to ObjectId since it references SocialAccount._id
  platform: string;
  content: string;
  mediaType: string;
  mediaUrls?: string[];
  postId?: string; // Keep as string (this is the platform's ID)
  postUrl?: string;
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

  scheduledPostId?: string; // Keep as string if this is not a MongoDB ID
}
