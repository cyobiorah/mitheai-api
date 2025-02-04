export interface Organization {
  id: string;
  name: string;
  type: 'enterprise' | 'business' | 'startup';
  settings: {
    maxTeams: number;
    maxUsers: number;
    features: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  organizationId: string;
  settings: {
    permissions: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  uid?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'org_owner' | 'team_manager' | 'user';
  organizationId: string;
  teamIds: string[];
  status: 'pending' | 'active' | 'inactive';
  invitationToken?: string;
  settings: {
    permissions: string[];
    theme: 'light' | 'dark' | 'system';
    notifications: string[];
  };
  createdAt: string;
  updatedAt: string;
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

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: User['role'];
  organizationId: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  teamIds: string[];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
