import { Request, Response } from "express";
import {
  LoginRequest,
  RegisterRequest,
  JwtPayload,
  AuthResponse,
} from "../app-types/auth";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { UserService } from "../services/user.service";
import { OrganizationService } from "../services/organization.service";
import { TeamService } from "../services/team.service";
import { isOrganizationUser, User, IndividualUser } from "../app-types/index";
import { sendWelcomeEmail } from "../services/email.service";

// Initialize services using the singleton pattern
const userService = UserService.getInstance();
const organizationService = OrganizationService.getInstance();
const teamService = TeamService.getInstance();

// For backward compatibility
export const initAuthController = async () => {
  return userService;
};

/**
 * Login controller
 * Handles user authentication and returns a JWT token
 */
export const login = async (
  req: Request<{}, {}, LoginRequest>,
  res: Response
) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await userService.findByEmail(email);

    if (!user) {
      return res.status(401).json({ message: "Email not found" });
    }

    // Verify password
    if (!user.password) {
      console.error("User found but password is missing:", user.email);
      return res.status(401).json({
        message:
          "Authentication failed. User account might be using a different authentication method.",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Prepare response based on user type
    const response: AuthResponse = {
      token,
      user: userWithoutPassword as User,
    };

    // Add organization and team data for organization users
    if (isOrganizationUser(user) && user.organizationId) {
      const organization = await organizationService.findById(
        user.organizationId
      );
      if (organization) {
        response.organization = organization;
      }

      // Get all teams the user belongs to
      if (user.teamIds && user.teamIds.length > 0) {
        const teams = await Promise.all(
          user.teamIds.map((teamId) => teamService.findById(teamId))
        );
        // Filter out any null values (in case a team was deleted)
        response.teams = teams.filter((team) => team !== null);
      } else {
        response.teams = [];
      }
    }

    res.json(response);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Register controller
 * Handles user registration for both individual and organization users
 */
export const register = async (
  req: Request<{}, {}, RegisterRequest>,
  res: Response
) => {
  try {
    const { firstName, lastName, email, password, userType, role } = req.body;

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate a unique UID
    const uid = uuidv4();

    // Common user data
    const baseUserData = {
      uid,
      email,
      firstName,
      lastName,
      password: hashedPassword,
      role: role || (userType === "organization" ? "org_owner" : "user"),
      status: "active" as const,
      settings: {
        permissions: ["content_management"],
        theme: "light" as const,
        notifications: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Handle organization-specific registration
    if (userType === "organization") {
      const { organizationName } = req.body;
      if (!organizationName) {
        return res
          .status(400)
          .json({ message: "Organization name is required" });
      }

      // Create organization user without organization ID initially
      const orgUser = await userService.create({
        ...baseUserData,
        userType: "organization",
        // teamIds: [], // Empty array initially
        // Will set organizationId after creating the organization
      });

      // Create organization
      const organization = await organizationService.create({
        name: organizationName,
        ownerId: orgUser._id,
        type: "business",
        settings: {
          maxTeams: 10,
          maxUsers: 50,
          features: ["content_management", "team_management", "analytics"],
          permissions: [""],
        },
      });

      // Create default team
      const team = await teamService.create({
        name: "Default Team",
        description: "Default team for organization",
        organizationId: organization.id,
        memberIds: [orgUser._id],
        settings: {
          permissions: ["content_write", "team_read"],
        },
      });

      // Update user with organization and team IDs
      const updatedUser = await userService.update(orgUser._id, {
        organizationId: organization.id,
        teamIds: [team.id],
      });

      // Generate JWT token
      const token = generateToken(updatedUser || orgUser);

      // Prepare response
      const finalUser = updatedUser || orgUser;
      const { password: _, ...userWithoutPassword } = finalUser;

      // Send welcome email
      try {
        await sendWelcomeEmail({
          to: email,
          firstName,
          lastName,
          userType: "organization",
          organizationName,
        });
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Continue with registration even if email fails
      }

      return res.status(201).json({
        token,
        user: userWithoutPassword as User,
        organization,
        team,
      });
    } else {
      // Handle individual user registration
      const individualUser = await userService.create({
        ...baseUserData,
        userType: "individual",
        individualSettings: {
          preferences: {
            defaultContentType: "social_post",
            aiPreferences: {
              tone: "professional",
              style: "concise",
            },
          },
        },
      } as Omit<IndividualUser, "uid" | "createdAt" | "updatedAt">);

      // Generate JWT token
      const token = generateToken(individualUser);

      // Remove password from user object
      const { password: _, ...userWithoutPassword } = individualUser;

      // Send welcome email for individual users
      try {
        await sendWelcomeEmail({
          to: email,
          firstName,
          lastName,
          userType: "individual",
        });
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
        // Continue with registration even if email fails
      }

      return res.status(201).json({
        token,
        user: userWithoutPassword as User,
      });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Me controller
 * Returns the current authenticated user's information
 */
export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { uid } = req.user;

    // Get user data
    const user = await userService.findById(uid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    // Prepare response
    const response: Partial<AuthResponse> = {
      user: userWithoutPassword as User,
    };

    // Add organization data for organization users
    if (isOrganizationUser(user) && user.organizationId) {
      const organization = await organizationService.findById(
        user.organizationId
      );
      if (organization) {
        response.organization = organization;
      }

      // Get all teams the user belongs to
      if (user.teamIds && user.teamIds.length > 0) {
        const teams = await Promise.all(
          user.teamIds.map((teamId) => teamService.findById(teamId))
        );
        // Filter out any null values (in case a team was deleted)
        response.teams = teams.filter((team) => team !== null);
      } else {
        response.teams = [];
        console.log(`No teams found for user ${user.email}`);
      }
    }

    res.json(response);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Generate JWT token
const generateToken = (user: User): string => {
  const payload: JwtPayload = {
    uid: user._id.toString(), // Use MongoDB _id converted to string
    email: user.email,
    userType: user.userType,
    // role: user.role || "user",
  };

  if (isOrganizationUser(user)) {
    payload.organizationId = user.organizationId;
    payload.teamIds = user.teamIds ?? [];
  }

  return jwt.sign(payload, process.env.JWT_SECRET ?? "", {
    expiresIn: "7d",
  });
};
