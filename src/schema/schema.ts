import { ObjectId } from "mongodb";

export interface SocialAccount {
  _id?: ObjectId;
  platform: "twitter" | "linkedin" | "tiktok";
  accountId: string;
  platformAccountId: string;
  accountName: string;
  accountType: "personal" | "business";
  userId: ObjectId;
  organizationId?: ObjectId;
  teamId?: ObjectId;

  accessToken: string;
  refreshToken?: string;
  refreshExpiresIn?: Date;
  tokenExpiry: Date;
  lastRefreshed: Date;
  status: "active" | "expired" | "error";

  email?: string;
  connectedAt: Date;

  metadata: {
    profileUrl?: string;
    followerCount?: number;
    followingCount?: number;
    connectionsCount?: number;
    lastChecked?: Date;
    profileImageUrl?: string;
    username?: string;
    bio?: string;
  };

  permissions: {
    canPost: boolean;
    canSchedule: boolean;
    canAnalyze: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}
