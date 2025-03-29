export interface Organization {
  id: string; // Firestore document ID
  name: string;
  description?: string;
  ownerId: string; // User ID of the organization owner
  type: "enterprise" | "business" | "startup";
  settings: {
    permissions: string[];
    maxTeams: number;
    maxUsers: number;
    features: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  uid: string; // Firebase Auth UID
  email: string;
  firstName: string;
  lastName: string;
  password?: string; // Optional because we don't always want to include it in responses
  userType: "individual" | "organization";
  status: "pending" | "active" | "inactive";
  settings: {
    permissions: string[];
    theme: "light" | "dark";
    notifications: any[];
    personalPreferences?: Record<string, any>;
  };
  // Organization-specific fields
  organizationId?: string; // Required for organization users, omitted for individual
  role?: "super_admin" | "org_owner" | "team_manager" | "user"; // Required for organization users
  teamIds?: string[]; // Required for organization users
  // Individual-specific fields
  personalSettings?: {
    defaultContentType?: string;
    aiPreferences?: {
      tone?: string;
      style?: string;
    };
  };
  // Invitation-related fields
  invitationToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string; // Firestore document ID
  name: string;
  description?: string;
  organizationId: string;
  memberIds: string[];
  settings: {
    permissions: string[];
  };
  createdAt: Date;
  updatedAt: Date;
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
  scope: "system" | "organization" | "team";
}

export interface Feature {
  name: string;
  description: string;
  dependencies: string[];
}

export interface ContentItem {
  id: string; // Firestore document ID
  title?: string;
  description?: string;
  type: "article" | "social_post" | "video" | "image" | "document";
  url?: string;
  content: string;
  metadata: {
    source: string;
    language: string;
    tags: string[];
    customFields: Record<string, any>;
    socialPost?: {
      platform: SocialPlatform;
      scheduledTime?: Date;
      publishedTime?: Date;
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
  status:
    | "draft"
    | "ready"
    | "pending"
    | "posted"
    | "failed"
    | "analyzed"
    | "archived";
  teamId: string | null; // Null for individual users
  organizationId: string | null; // Null for individual users
  createdBy: string; // User UID
  createdAt: Date;
  updatedAt: Date;
  analyzedAt?: Date;
}

export interface ContentCollection {
  id: string; // Firestore document ID
  name: string;
  description?: string;
  type: "manual" | "automated" | "smart";
  rules?: {
    filters: Array<{
      field: string;
      operator: "equals" | "contains" | "greater_than" | "less_than";
      value: any;
    }>;
    sort?: {
      field: string;
      direction: "asc" | "desc";
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
  createdBy: string; // User UID
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisTemplate {
  id: string; // Firestore document ID
  name: string;
  description?: string;
  type: "sentiment" | "classification" | "extraction" | "custom";
  config: {
    models: string[];
    parameters: Record<string, any>;
    preprocessors?: string[];
    postprocessors?: string[];
  };
  teamId: string | null; // Null for individual users
  organizationId: string | null; // Null for individual users
  settings: {
    permissions: string[];
    autoApply: boolean;
    contentTypes: ContentItem["type"][];
  };
  createdBy: string; // User UID
  createdAt: Date;
  updatedAt: Date;
}

export type SocialPlatform = "twitter" | "facebook" | "linkedin" | "instagram";

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: User["role"];
  organizationId: string;
  token: string;
  status: "pending" | "accepted" | "expired";
  teamIds: string[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
