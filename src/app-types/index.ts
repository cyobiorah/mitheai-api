export interface Organization {
  id: string;
  name: string;
  type: "enterprise" | "business" | "startup";
  settings: {
    maxTeams: number;
    maxUsers: number;
    features: string[];
  };
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Team {
  id: string;
  name: string;
  organizationId: string;
  settings: {
    permissions: string[];
  };
  createdAt: string | Date;
  updatedAt: string | Date;
}

// Base user interface with common properties
export interface BaseUser {
  _id?: any;
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  role: "super_admin" | "org_owner" | "team_manager" | "user";
  status: "pending" | "active" | "inactive";
  invitationToken?: string;
  settings: {
    permissions: string[];
    theme: "light" | "dark" | "system";
    notifications: string[];
  };
  createdAt: string | Date;
  updatedAt: string | Date;
}

// Individual user type
export interface IndividualUser extends BaseUser {
  userType: "individual";
  // Individual-specific settings
  individualSettings?: {
    preferences: {
      defaultContentType?: string;
      aiPreferences?: {
        tone?: string;
        style?: string;
      };
    };
  };
}

// Organization user type
export interface OrganizationUser extends BaseUser {
  userType: "organization";
  organizationId: string;
  teamIds: string[];
  // Organization-specific settings
  organizationSettings?: {
    defaultTeamId?: string;
    permissions?: string[];
  };
}

// Union type for all user types
export type User = IndividualUser | OrganizationUser;

// Type guard to check if a user is an organization user
export function isOrganizationUser(user: User): user is OrganizationUser {
  return user.userType === "organization";
}

// Type guard to check if a user is an individual user
export function isIndividualUser(user: User): user is IndividualUser {
  return user.userType === "individual";
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

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "super_admin" | "org_owner" | "team_manager" | "user";
  organizationId: string;
  token: string;
  status: "pending" | "accepted" | "expired";
  teamIds: string[];
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}
