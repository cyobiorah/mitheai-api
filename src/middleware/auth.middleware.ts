import { Request, Response, NextFunction } from "express";
import { auth, collections } from "../config/firebase";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        userType?: 'individual' | 'organization';
        organizationId?: string;
        teamIds?: string[];
        currentTeamId?: string;
        role?: 'super_admin' | 'org_owner' | 'team_manager' | 'user';
        isNewUser?: boolean;
        settings?: {
          permissions: string[];
          theme: 'light' | 'dark';
          notifications: any[];
          personalPreferences?: Record<string, any>;
        };
      };
    }
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip authentication for test routes in development
    if (
      process.env.NODE_ENV === "development" &&
      (req.path === "/api/test-invitation-email" ||
        req.originalUrl === "/api/test-invitation-email")
    ) {
      req.user = {
        uid: "test-user-id",
        email: "test@example.com",
        userType: "organization",
        teamIds: ["test-team-id"],
        currentTeamId: "test-team-id",
        isNewUser: false,
        settings: {
          permissions: ["all"],
          theme: "light",
          notifications: []
        }
      };
      return next();
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      // Verify the Firebase ID token
      const decodedToken = await auth.verifyIdToken(token);

      // Get user from Firestore
      const userDoc = await collections.users.doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userDoc.exists) {
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          isNewUser: true,
          settings: {
            permissions: [],
            theme: "light",
            notifications: []
          }
        };
      } else {
        // Set user data based on user type
        const {
          userType,
          organizationId,
          teamIds,
          currentTeamId,
          role,
          settings,
          ...otherData
        } = userData!;

        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          userType,
          isNewUser: false,
          settings,
          ...(userType === 'organization' && {
            organizationId,
            teamIds: teamIds || [],
            currentTeamId,
            role
          })
        };
      }

      next();
    } catch (error) {
      console.error("[DEBUG] Auth error:", error);
      res.status(403).json({ message: "Invalid token" });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    res
      .status(500)
      .json({ message: "Internal server error during authentication" });
  }
};

// Middleware to check if user belongs to a team
export const requireTeamAccess = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;
  const teamId = req.params.teamId || req.body.teamId;

  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Individual users don't have team access
  if (user.userType === 'individual') {
    return res.status(403).json({ 
      message: "Individual users cannot access team resources" 
    });
  }

  if (!teamId) {
    return res.status(400).json({ message: "Team ID is required" });
  }

  if (!user.teamIds?.includes(teamId)) {
    return res.status(403).json({ 
      message: "You do not have access to this team" 
    });
  }

  next();
};

// Middleware to check organization access
export const requireOrgAccess = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;
  const orgId = req.params.organizationId || req.body.organizationId;

  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Individual users don't have organization access
  if (user.userType === 'individual') {
    return res.status(403).json({ 
      message: "Individual users cannot access organization resources" 
    });
  }

  if (!orgId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  if (user.organizationId !== orgId) {
    return res.status(403).json({ 
      message: "You do not have access to this organization" 
    });
  }

  next();
};
