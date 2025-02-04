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
  organizationId: string;
  role: 'super_admin' | 'org_owner' | 'team_manager' | 'user';
  teamIds: string[];  // Can be empty array for pending users
  status: 'pending' | 'active' | 'inactive';
  invitationToken?: string;
  settings: {
    permissions: string[];
    theme: 'light' | 'dark';
    notifications: any[];
  };
  pendingTeamInvites?: string[];  // Add this to track pending team invitations
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
  title: string;
  description?: string;
  type: 'article' | 'social_post' | 'video' | 'image' | 'document';
  url?: string;
  content: string;
  metadata: {
    source: string;
    language: string;
    tags: string[];
    customFields: Record<string, any>;
  };
  analysis: {
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
  status: 'pending' | 'analyzed' | 'archived';
  teamId: string;
  organizationId: string;
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
  teamId: string;
  organizationId: string;
  settings: {
    permissions: string[];
    autoApply: boolean;
    contentTypes: ContentItem['type'][];
  };
  createdBy: string;  // User UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type Timestamp = string; // ISO string format
