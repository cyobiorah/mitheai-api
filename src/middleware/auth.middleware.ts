import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { RepositoryFactory } from "../repositories/repository.factory";
import { JwtPayload } from "../app-types/auth";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET ?? "your-secret-key-change-this-in-production"
    ) as JwtPayload;

    // Get user from database
    const userRepository = await RepositoryFactory.createUserRepository();
    let user = await userRepository.findOne({ uid: decoded.uid });

    // Try to find user using multiple methods
    // let user;
    try {
      // First try to find by id (most reliable if present)
      if (decoded.uid) {
        try {
          // Try to find by id directly first
          user = await userRepository.findOne({ uid: decoded.uid });

          // If not found and it looks like a MongoDB ObjectId, try findById
          if (!user && /^[0-9a-fA-F]{24}$/.test(decoded.uid)) {
            try {
              user = await userRepository.findById(decoded.uid);
            } catch (error) {
              console.error("Error finding user by ObjectId:", error);
            }
          }
        } catch (error) {
          console.error("Error finding user by id:", error);
        }
      }

      // If not found by id, try by email
      if (!user && decoded.email) {
        user = await userRepository.findOne({ email: decoded.email });
      }

      // Last resort, try by uid
      if (!user && decoded.uid) {
        user = await userRepository.findOne({ uid: decoded.uid });
      }
    } catch (error) {
      console.error("Error finding user:", error);
      return res.status(401).json({ message: "Authentication failed" });
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Check if user is active
    if (user.status !== "active") {
      return res.status(403).json({ message: "User account is not active" });
    }

    // Add user to request object
    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Token expired" });
    }

    console.error("Authentication error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// For backward compatibility with existing routes
export const authenticateToken = authenticate;

// Middleware to check if user has required role
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
};

// Middleware to check if user has required permissions
export const hasPermission = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userPermissions = req.user.settings?.permissions || [];
    const hasAllPermissions = permissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
};

// Middleware to check if user belongs to organization
export const belongsToOrganization = (paramName: string = "organizationId") => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const organizationId = req.params[paramName] || req.body[paramName];

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    if (req.user.organizationId !== organizationId) {
      return res
        .status(403)
        .json({ message: "Access denied to this organization" });
    }

    next();
  };
};

// Middleware to check if user belongs to team
export const belongsToTeam = (paramName: string = "teamId") => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const teamId = req.params[paramName] || req.body[paramName];

    if (!teamId) {
      return res.status(400).json({ message: "Team ID is required" });
    }

    const userTeams = req.user.teamIds || [];

    if (!userTeams.includes(teamId)) {
      return res.status(403).json({ message: "Access denied to this team" });
    }

    next();
  };
};

// Middleware to check if user has organization access (either belongs to org or is admin)
export const requireOrgAccess = (paramName: string = "organizationId") => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const organizationId = req.params[paramName] || req.body[paramName];

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    // Check if user belongs to organization or is admin
    const hasAccess =
      req.user.organizationId === organizationId || req.user.role === "admin";

    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "Access denied to this organization" });
    }

    next();
  };
};
