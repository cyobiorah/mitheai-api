import { z } from 'zod';

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Base register schema
const baseRegisterSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{6,}$/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  userType: z.enum(['individual', 'organization']),
});

// Organization-specific schema
export const organizationRegisterSchema = baseRegisterSchema.extend({
  userType: z.literal('organization'),
  organizationName: z.string().min(1, 'Organization name is required').max(100),
});

// Individual user schema
export const individualRegisterSchema = baseRegisterSchema.extend({
  userType: z.literal('individual'),
});

// Combined register schema
export const registerSchema = z.discriminatedUnion('userType', [
  organizationRegisterSchema,
  individualRegisterSchema,
]);

// Request types
export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type OrganizationRegisterRequest = z.infer<typeof organizationRegisterSchema>;
export type IndividualRegisterRequest = z.infer<typeof individualRegisterSchema>;

// Response types
export interface AuthResponse {
  token: string;
  firebaseToken: string;
  user: User;
  organization?: Organization;  // Optional for individual users
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'individual' | 'organization';
  organizationId?: string;  // Optional for individual users
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
  settings?: {
    permissions: string[];
    theme: 'light' | 'dark';
    notifications: any[];
    personalPreferences?: Record<string, any>;
  };
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  settings?: OrganizationSettings;
}

export interface OrganizationSettings {
  allowUserInvites?: boolean;
  maxTeamMembers?: number;
  allowedDomains?: string[];
}
