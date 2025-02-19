import { Organization, Team, User, Role, Permission, Feature } from '../types';

export const organizations: Record<string, Organization> = {
  mitheia_org: {
    id: "mitheia_org",
    name: "Mitheia Corporation",
    description: "Enterprise-level organization for Mitheia",
    type: "enterprise",
    settings: {
      permissions: ["all"],
      maxTeams: 999,
      maxUsers: 999,
      features: ["all"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_corp: {
    id: "test_corp",
    name: "Test Corporation",
    description: "Business-level test organization",
    type: "business",
    settings: {
      permissions: ["content_management", "team_management"],
      maxTeams: 10,
      maxUsers: 50,
      features: ["content_management", "team_management", "analytics"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  small_org: {
    id: "small_org",
    name: "Small Organization",
    description: "Startup-level organization",
    type: "startup",
    settings: {
      permissions: ["content_management"],
      maxTeams: 3,
      maxUsers: 10,
      features: ["content_management", "basic_analytics"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

export const teams: Record<string, Team> = {
  mitheia_core: {
    id: "mitheia_core",
    name: "Core Team",
    description: "Core team for Mitheia development",
    organizationId: "mitheia_org",
    memberIds: ["super_admin"],
    settings: {
      permissions: ["all"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_engineering: {
    id: "test_engineering",
    name: "Engineering",
    description: "Engineering team for Test Corp",
    organizationId: "test_corp",
    memberIds: ["test_owner", "test_manager", "test_user"],
    settings: {
      permissions: ["content_write", "team_read"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_marketing: {
    id: "test_marketing",
    name: "Marketing",
    description: "Marketing team for Test Corp",
    organizationId: "test_corp",
    memberIds: ["test_owner"],
    settings: {
      permissions: ["content_write", "analytics_read"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  small_team: {
    id: "small_team",
    name: "Main Team",
    description: "Main team for small org",
    organizationId: "small_org",
    memberIds: ["small_owner"],
    settings: {
      permissions: ["content_write"]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

export const users: Record<string, User> = {
  super_admin: {
    uid: "super_admin",
    email: "admin@mitheia.com",
    firstName: "Super",
    lastName: "Admin",
    role: "super_admin",
    organizationId: "mitheia_org",
    teamIds: ["mitheia_core"],
    status: "active",
    settings: {
      permissions: ["all"],
      theme: "dark",
      notifications: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_owner: {
    uid: "test_owner",
    email: "owner@test.com",
    firstName: "Test",
    lastName: "Owner",
    role: "org_owner",
    organizationId: "test_corp",
    teamIds: ["test_engineering", "test_marketing"],
    status: "active",
    settings: {
      permissions: ["org_manage", "team_manage", "user_manage"],
      theme: "light",
      notifications: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_manager: {
    uid: "test_manager",
    email: "manager@test.com",
    firstName: "Team",
    lastName: "Manager",
    role: "team_manager",
    organizationId: "test_corp",
    teamIds: ["test_engineering"],
    status: "active",
    settings: {
      permissions: ["team_manage", "content_manage"],
      theme: "light",
      notifications: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  test_user: {
    uid: "test_user",
    email: "user@test.com",
    firstName: "Regular",
    lastName: "User",
    role: "user",
    organizationId: "test_corp",
    teamIds: ["test_engineering"],
    status: "active",
    settings: {
      permissions: ["content_write"],
      theme: "light",
      notifications: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  small_owner: {
    uid: "small_owner",
    email: "owner@small.com",
    firstName: "Small",
    lastName: "Owner",
    role: "org_owner",
    organizationId: "small_org",
    teamIds: ["small_team"],
    status: "active",
    settings: {
      permissions: ["org_manage", "team_manage"],
      theme: "light",
      notifications: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

export const roles: Record<string, Role> = {
  super_admin: {
    name: "Super Admin",
    description: "Full system access",
    permissions: ["all"],
    level: 0
  },
  org_owner: {
    name: "Organization Owner",
    description: "Full organization access",
    permissions: ["org_manage", "team_manage", "user_manage", "content_manage"],
    level: 1
  },
  team_manager: {
    name: "Team Manager",
    description: "Team management access",
    permissions: ["team_manage", "content_manage"],
    level: 2
  },
  user: {
    name: "User",
    description: "Basic user access",
    permissions: ["content_write"],
    level: 3
  }
};

export const permissions: Record<string, Permission> = {
  all: {
    name: "All Permissions",
    description: "Full system access",
    scope: "system"
  },
  org_manage: {
    name: "Organization Management",
    description: "Manage organization settings",
    scope: "organization"
  },
  team_manage: {
    name: "Team Management",
    description: "Manage teams",
    scope: "organization"
  },
  user_manage: {
    name: "User Management",
    description: "Manage users",
    scope: "organization"
  },
  content_manage: {
    name: "Content Management",
    description: "Manage all content",
    scope: "team"
  },
  content_write: {
    name: "Content Write",
    description: "Create and edit content",
    scope: "team"
  },
  analytics_read: {
    name: "Analytics Read",
    description: "View analytics",
    scope: "team"
  }
};

export const features: Record<string, Feature> = {
  content_management: {
    name: "Content Management",
    description: "Core content management features",
    dependencies: []
  },
  team_management: {
    name: "Team Management",
    description: "Team management features",
    dependencies: ["content_management"]
  },
  analytics: {
    name: "Analytics",
    description: "Advanced analytics features",
    dependencies: ["content_management"]
  },
  basic_analytics: {
    name: "Basic Analytics",
    description: "Basic analytics features",
    dependencies: ["content_management"]
  }
};
