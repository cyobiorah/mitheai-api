import { z } from "zod";
import { User, Organization, Team } from "./index";

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Base register schema
const baseRegisterSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{6,}$/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  userType: z.enum(["individual", "organization"]),
});

// Organization-specific schema
export const organizationRegisterSchema = baseRegisterSchema.extend({
  userType: z.literal("organization"),
  organizationName: z.string().min(1, "Organization name is required").max(100),
  role: z.enum(["org_owner"]).default("org_owner"),
});

// Individual user schema
export const individualRegisterSchema = baseRegisterSchema.extend({
  userType: z.literal("individual"),
  role: z.enum(["user"]).default("user"),
});

// Combined register schema
export const registerSchema = z.discriminatedUnion("userType", [
  organizationRegisterSchema,
  individualRegisterSchema,
]);

// Request types
export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type OrganizationRegisterRequest = z.infer<
  typeof organizationRegisterSchema
>;
export type IndividualRegisterRequest = z.infer<
  typeof individualRegisterSchema
>;

// Response types
export interface AuthResponse {
  token: string;
  user: User;
  organization?: Organization;
  teams?: Team[];
}

// JWT Payload structure
export interface JwtPayload {
  uid: string; // Primary user identifier
  email: string; // User's email
  userType: "individual" | "organization"; // User type
  organizationId?: string; // Organization ID for organization users
  teamIds?: string[]; // Team IDs for organization users
  currentTeamId?: string; // Current team ID for organization users
  iat?: number; // Issued at timestamp
  exp?: number; // Expiration timestamp
}
