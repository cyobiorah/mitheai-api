import { Timestamp } from 'firebase-admin/firestore';

export interface SocialAccount {
  id: string;
  platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook';
  accountType: 'personal' | 'business';
  accountName: string;
  accountId: string;
  accessToken: string;
  refreshToken: string; // For Twitter, this is the access token secret
  tokenExpiry: Timestamp | null; // Null for Twitter (OAuth 1.0a tokens don't expire)
  lastRefreshed: Timestamp;
  status: 'active' | 'expired' | 'revoked' | 'error';
  organizationId?: string;
  teamId?: string;
  userId: string;
  metadata: {
    profileUrl: string;
    followerCount?: number;
    followingCount?: number;
    lastChecked?: Timestamp;
  };
  permissions: {
    canPost: boolean;
    canSchedule: boolean;
    canAnalyze: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}