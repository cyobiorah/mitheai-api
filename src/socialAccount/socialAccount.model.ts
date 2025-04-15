// export interface SocialAccount {
//   _id: string;
//   platform: "twitter" | "linkedin" | "instagram" | "facebook" | "threads";
//   platformAccountId: string; // Unique identifier from the platform (e.g., Twitter user ID)
//   accountType: "personal" | "business";
//   accountName: string;
//   accountId: string;
//   accessToken: string;
//   refreshToken: string; // For Twitter, this is the access token secret
//   tokenExpiry: Date | null; // Null for Twitter (OAuth 1.0a tokens don't expire)
//   lastRefreshed: Date;
//   status: "active" | "expired" | "revoked" | "error";
//   organizationId?: string;
//   teamId?: string;
//   userId: string;
//   ownershipLevel: "user" | "team" | "organization"; // Indicates who owns/controls this account
//   metadata: {
//     email?: string;
//     profileUrl?: string;
//     followerCount?: number;
//     followingCount?: number;
//     lastChecked?: Date;
//     tokenExpiresAt?: Date;
//     profile?: any;
//     lastError?: string;
//     lastErrorTime?: Date;
//     requiresReauth?: boolean;
//   };
//   permissions: {
//     canPost?: boolean;
//     canSchedule?: boolean;
//     canAnalyze?: boolean;
//   };
//   welcomeTweetSent?: boolean; // Track whether a welcome tweet has been sent
//   createdAt: Date;
//   updatedAt: Date;
// }

// // This represents the unique index that should be created in Firestore
// // platform + platformAccountId should be unique across the collection
// export const SOCIAL_ACCOUNT_UNIQUE_CONSTRAINT = [
//   "platform",
//   "platformAccountId",
// ];

import { ObjectId } from "mongodb";

export interface SocialAccount {
  _id: ObjectId; // Changed to ObjectId
  platform: "twitter" | "linkedin" | "instagram" | "facebook" | "threads";
  platformAccountId: string;
  accountType: "personal" | "business";
  accountName: string;
  accountId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date | null;
  lastRefreshed: Date;
  status: "active" | "expired" | "revoked" | "error";
  organizationId?: ObjectId; // Changed to ObjectId if these are MongoDB IDs
  teamId?: ObjectId; // Changed to ObjectId if these are MongoDB IDs
  userId: string; // Keep as string if this is not a MongoDB ID
  ownershipLevel: "user" | "team" | "organization";
  metadata: {
    email?: string;
    profileUrl?: string;
    followerCount?: number;
    followingCount?: number;
    lastChecked?: Date;
    tokenExpiresAt?: Date;
    profile?: any;
    lastError?: string;
    lastErrorTime?: Date;
    requiresReauth?: boolean;
  };
  permissions: {
    canPost?: boolean;
    canSchedule?: boolean;
    canAnalyze?: boolean;
  };
  welcomeTweetSent?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// MongoDB unique compound index definition
export const SOCIAL_ACCOUNT_INDEXES = [
  {
    key: { platform: 1, platformAccountId: 1 },
    unique: true,
    name: "platform_platformAccountId_unique",
  },
] as const;
