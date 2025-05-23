import { Request, Response } from "express";
import * as AuthService from "../services/auth.service";
import * as UsersService from "../services/users.service";
import * as OrgsService from "../services/organizations.service";
import * as TeamsService from "../services/teams.service";
import { validationError } from "../validation/validationError";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../services/email.service";

// REGISTER
export const register = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      userType,
      role,
      organizationName,
    } = req.body;

    // Check if user already exists
    const existingUser = await UsersService.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Organization user registration
    if (userType === "organization") {
      if (!organizationName) {
        return res
          .status(400)
          .json({ message: "Organization name is required" });
      }

      // Create user
      const orgUser = await AuthService.registerUser({
        firstName,
        lastName,
        email,
        password,
        role: role ?? "org_owner",
        userType: "organization",
        status: "active",
      });

      // Create organization
      const organization = await OrgsService.createOrganization({
        name: organizationName,
        ownerId: orgUser._id,
        memberIds: [orgUser._id],
      });

      // Create default team
      const team = await TeamsService.createTeam({
        name: "Default Team",
        organizationId: organization._id,
        creatorId: orgUser._id,
      });

      // Update user with org/team IDs
      await UsersService.updateUser(orgUser._id, {
        organizationId: organization._id,
        teamIds: [team._id],
      });

      // Remove password before sending
      const { password: _, ...userWithoutPassword } = {
        ...orgUser,
        organizationId: organization._id,
        teamIds: [team._id],
      };

      // Send welcome email
      await sendWelcomeEmail({
        to: email,
        firstName,
        lastName,
        userType: "organization",
        organizationName,
      });

      // Generate JWT
      const token = AuthService.generateJWT(userWithoutPassword);

      return res.status(201).json({
        token,
        user: userWithoutPassword,
        organization,
        team,
      });
    } else {
      // Individual user registration
      const individualUser = await AuthService.registerUser({
        firstName,
        lastName,
        email,
        password,
        role: role ?? "user",
        userType: "individual",
        status: "active",
      });

      const { password: _, ...userWithoutPassword } = individualUser;

      // Send welcome email
      await sendWelcomeEmail({
        to: email,
        firstName,
        lastName,
        userType: "individual",
      });

      const token = AuthService.generateJWT(userWithoutPassword);

      return res.status(201).json({
        token,
        user: userWithoutPassword,
      });
    }
  } catch (error: any) {
    if (error.name === "ValidationError") {
      const errors = validationError(error);
      return res.status(400).json({ errors, message: "Validation error" });
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const user = await AuthService.authenticateUser(
      req.body.email,
      req.body.password
    );

    // Remove password before sending
    const { password: _, ...userWithoutPassword } = user;
    const token = AuthService.generateJWT(userWithoutPassword);

    // Fetch org and teams if they exist
    let organization = null;
    let teams: any[] = [];

    if (user.organizationId) {
      organization = await OrgsService.getOrganizationById(user.organizationId);
    }

    if (user.teamIds && user.teamIds.length > 0) {
      teams = await TeamsService.getTeamsByIds(user.teamIds);
    }

    res.json({ user: userWithoutPassword, token, organization, teams });
  } catch (err: any) {
    console.error("Login error:", err);
    res
      .status(err.statusCode ?? err.status ?? 500)
      .json({ message: err.message });
  }
};

// FORGOT PASSWORD
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await AuthService.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = AuthService.generateJWT({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
    });

    const resetLink = `${process.env.WEBAPP_URL}reset-password?token=${token}`;

    await sendPasswordResetEmail({
      to: email,
      token,
      firstName: user.firstName,
      resetLink,
    });

    // save token to user
    await UsersService.updateUser(user._id, { resetToken: token });

    res.json({ message: "Password reset email sent successfully" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// RESET PASSWORD
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    const user = await AuthService.findUserByToken(token);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await AuthService.resetPassword(user._id.toString(), password);

    res.json({ message: "Password reset successfully" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE MY ACCOUNT
export const deleteOwnAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id!;
    await AuthService.deleteUser(userId);
    res.json({ message: "Account deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
