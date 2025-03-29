import { Request, Response } from "express";
import {
  LoginRequest,
  RegisterRequest,
  IndividualRegisterRequest,
  OrganizationRegisterRequest,
} from "../types/auth";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { UserService } from "../services/user.service";
import { OrganizationService } from "../services/organization.service";
import { TeamService } from "../services/team.service";

// Initialize services
const userService = new UserService();
const organizationService = new OrganizationService();
const teamService = new TeamService();

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
    const token = jwt.sign(
      {
        id: user.uid,
        uid: user.uid,
        email: user.email,
      },
      process.env.JWT_SECRET ?? "your-secret-key-change-this-in-production",
      { expiresIn: "24h" }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Get organization data if user is organization type
    let organizationData;
    if (user.userType === "organization" && user.organizationId) {
      organizationData = await organizationService.findById(
        user.organizationId
      );
    }

    res.json({
      token,
      user: userWithoutPassword,
      ...(organizationData && { organization: organizationData }),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const register = async (
  req: Request<{}, {}, RegisterRequest>,
  res: Response
) => {
  try {
    const { firstName, lastName, email, password, userType } = req.body;

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);

    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Base user data
    const baseUserData = {
      email,
      firstName,
      lastName,
      password: hashedPassword,
      userType,
      status: "active" as "active" | "pending" | "inactive",
      settings: {
        permissions: ["content_management"],
        theme: "light" as "light" | "dark",
        notifications: [],
      },
    };

    let organizationId, teamId;
    let organizationData, teamData;

    // Handle organization-specific setup
    if (userType === "organization") {
      const { organizationName } = req.body;

      // Create user first to get the ID
      const user = await userService.create({
        ...baseUserData,
        role: "org_owner",
        teamIds: [],
      });

      // Create organization
      const organization = await organizationService.create({
        name: organizationName,
        ownerId: user.uid,
        type: "business",
        settings: {
          permissions: ["content_management", "team_management"],
          maxTeams: 10,
          maxUsers: 50,
          features: ["content_management", "team_management", "analytics"],
        },
      });

      organizationId = organization.id;

      // Create default team
      const team = await teamService.create({
        name: "Default Team",
        description: "Default team for organization",
        organizationId: organization.id,
        memberIds: [user.uid],
        settings: {
          permissions: ["content_write", "team_read"],
        },
      });

      teamId = team.id;

      // Update user with organization and team IDs
      await userService.update(user.uid, {
        organizationId: organization.id,
        teamIds: [team.id],
      });

      // Get updated user data
      const updatedUser = await userService.findById(user.uid);

      // Generate JWT token
      const token = jwt.sign(
        {
          id: updatedUser?.uid,
          uid: user.uid,
          email,
        },
        process.env.JWT_SECRET ?? "your-secret-key-change-this-in-production",
        { expiresIn: "24h" }
      );

      // Get organization and team data
      organizationData = organization;
      teamData = team;

      // Remove password from response
      let userWithoutPassword;
      if (updatedUser) {
        const { password: _, ...rest } = updatedUser;
        userWithoutPassword = rest;
      } else {
        // Fallback to original user if updatedUser is null
        const { password: _, ...rest } = user;
        userWithoutPassword = rest;
      }

      return res.status(201).json({
        token,
        user: userWithoutPassword,
        organization: organizationData,
        team: teamData,
      });
    } else {
      // Individual user
      const individualUserData = {
        ...baseUserData,
        settings: {
          ...baseUserData.settings,
          personalPreferences: {
            defaultContentType: "social_post",
            aiPreferences: {
              tone: "professional",
              style: "concise",
            },
          },
        },
      };

      // Create individual user
      const user = await userService.createWithPassword(individualUserData);

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.uid,
          uid: user.uid,
          email,
        },
        process.env.JWT_SECRET ?? "your-secret-key-change-this-in-production",
        { expiresIn: "24h" }
      );

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return res.status(201).json({
        token,
        user: userWithoutPassword,
      });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Use findOne with uid instead of findById to avoid ObjectId conversion issues
    const user = await userService.findOne({ uid: req.user.uid });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    // Get organization data if user is organization type
    let organizationData;
    if (user.userType === "organization" && user.organizationId) {
      try {
        organizationData = await organizationService.findById(
          user.organizationId
        );
      } catch (error) {
        console.error("Error fetching organization data:", error);
      }
    }

    res.json({
      user: userWithoutPassword,
      ...(organizationData && { organization: organizationData }),
    });
  } catch (error) {
    console.error("Me endpoint error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
