import { Timestamp } from 'firebase-admin/firestore';

export interface Organization {
  id: string;  // Firestore document ID
  name: string;
  description?: string;
  type: 'enterprise' | 'business' | 'startup';
  settings: {
    permissions: string[];
    maxTeams: number;
    maxUsers: number;
    features: string[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface User {
  uid: string;  // Firebase Auth UID
  email: string;
  firstName: string;
  lastName: string;
  userType: 'individual' | 'organization';
  organizationId?: string;  // Required for organization users, omitted for individual
  role?: 'super_admin' | 'org_owner' | 'team_manager' | 'user';  // Required for organization users
  teamIds?: string[];  // Required for organization users
  status: 'pending' | 'active' | 'inactive';
  invitationToken?: string;
  settings: {
    permissions: string[];
    theme: 'light' | 'dark';
    notifications: any[];
    personalPreferences?: Record<string, any>;  // For individual users
  };
  pendingTeamInvites?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Team {
  id: string;  // Firestore document ID
  name: string;
  description?: string;
  organizationId: string;
  memberIds: string[];
  settings: {  
    permissions: string[];
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Role {
  name: string;
  description: string;
  permissions: string[];
  level: number;
}

export interface Permission {
  name: string;
  description: string;
  scope: 'system' | 'organization' | 'team';
}

export interface Feature {
  name: string;
  description: string;
  dependencies: string[];
}

export interface ContentItem {
  id: string;  // Firestore document ID
  title?: string;
  description?: string;
  type: 'article' | 'social_post' | 'video' | 'image' | 'document';
  url?: string;
  content: string;
  metadata: {
    source: string;
    language: string;
    tags: string[];
    customFields: Record<string, any>;
    socialPost?: {
      platform: SocialPlatform;
      scheduledTime?: Timestamp;
      publishedTime?: Timestamp;
      postId?: string;
      retryCount?: number;
      failureReason?: string;
    };
  };
  analysis?: {
    sentiment?: number;
    keywords?: string[];
    categories?: string[];
    entities?: Array<{
      name: string;
      type: string;
      sentiment?: number;
    }>;
    customAnalytics?: Record<string, any>;
  };
  status: 'draft' | 'ready' | 'pending' | 'posted' | 'failed' | 'analyzed' | 'archived';
  teamId: string | null;  // Null for individual users
  organizationId: string | null;  // Null for individual users
  createdBy: string;  // User UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  analyzedAt?: Timestamp;
}

export interface ContentCollection {
  id: string;  // Firestore document ID
  name: string;
  description?: string;
  type: 'manual' | 'automated' | 'smart';
  rules?: {
    filters: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
      value: any;
    }>;
    sort?: {
      field: string;
      direction: 'asc' | 'desc';
    };
  };
  teamId: string;
  organizationId: string;
  contentIds: string[];
  settings: {
    permissions: string[];
    autoAnalyze: boolean;
    notifications: {
      enabled: boolean;
      triggers: Array<{
        event: string;
        actions: string[];
      }>;
    };
  };
  createdBy: string;  // User UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AnalysisTemplate {
  id: string;  // Firestore document ID
  name: string;
  description?: string;
  type: 'sentiment' | 'classification' | 'extraction' | 'custom';
  config: {
    models: string[];
    parameters: Record<string, any>;
    preprocessors?: string[];
    postprocessors?: string[];
  };
  teamId: string | null;  // Null for individual users
  organizationId: string | null;  // Null for individual users
  settings: {
    permissions: string[];
    autoApply: boolean;
    contentTypes: ContentItem['type'][];
  };
  createdBy: string;  // User UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type SocialPlatform = 'twitter' | 'facebook' | 'linkedin' | 'instagram';
