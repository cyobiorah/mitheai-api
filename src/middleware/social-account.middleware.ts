import { Request, Response, NextFunction } from "express";
import { firestore } from "firebase-admin";
import { SocialAccount } from "../models/social-account.model";

// Extend Express Request type to include socialAccount
declare global {
  namespace Express {
    interface Request {
      socialAccount?: SocialAccount;
    }
  }
}

// Permission types for social accounts
export const permissionTypes = {
  VIEW: "view_account",
  USE: "use_account",
  MANAGE: "manage_account",
  DISCONNECT: "disconnect_account",
};

/**
 * Middleware to validate social account operations
 * Checks if the account exists and if the user has permission to perform the operation
 */
export const validateSocialAccountOperation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip validation for certain operations
    if (req.path.includes("/connect")) {
      return next();
    }

    const accountId = req.params.accountId || req.body.accountId;

    if (!accountId) {
      return res.status(400).json({
        error: "missing_account_id",
        message: "Account ID is required",
      });
    }

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: "authentication_required",
        message: "Authentication required",
      });
    }

    // Get the social account
    const db = firestore();
    const accountDoc = await db
      .collection("social_accounts")
      .doc(accountId)
      .get();

    if (!accountDoc.exists) {
      return res.status(404).json({
        error: "account_not_found",
        message: "Social account not found",
      });
    }

    const account = {
      id: accountDoc.id,
      ...accountDoc.data(),
    } as SocialAccount;

    let hasPermission = false;

    // Individual user access
    if (req.user.userType === "individual") {
      // Individual users can only access their own accounts
      hasPermission = account.userId === req.user.uid;
    }
    // Organization user access
    else {
      // Direct ownership
      if (account.userId === req.user.uid) {
        hasPermission = true;
      }
      // Team-level ownership
      else if (
        account.ownershipLevel === "team" &&
        account.teamId &&
        req.user.teamIds?.includes(account.teamId)
      ) {
        hasPermission = ["super_admin", "org_owner", "team_manager"].includes(
          req.user.role || ""
        );
      }
      // Organization-level ownership
      else if (
        account.ownershipLevel === "organization" &&
        account.organizationId === req.user.organizationId
      ) {
        hasPermission = ["super_admin", "org_owner"].includes(
          req.user.role || ""
        );
      }
    }

    if (!hasPermission) {
      return res.status(403).json({
        error: "permission_denied",
        message:
          "You don't have permission to perform this operation on this social account",
      });
    }

    // Add the account to the request for downstream handlers
    req.socialAccount = account;

    next();
  } catch (error) {
    console.error("Error validating social account operation:", error);
    res.status(500).json({
      error: "validation_failed",
      message: "Failed to validate social account operation",
    });
  }
};

/**
 * Middleware to check for duplicate social accounts when connecting a new one
 */
export const checkDuplicateSocialAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { platform, platformAccountId } = req.body;

    if (!platform || !platformAccountId) {
      return next();
    }

    // Check if account already exists
    const db = firestore();
    const snapshot = await db
      .collection("social_accounts")
      .where("platform", "==", platform)
      .where("platformAccountId", "==", platformAccountId)
      .get();

    if (!snapshot.empty) {
      const existingAccount = {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data(),
      } as SocialAccount;

      // Get the connected user's details for better error messaging
      const connectedUserDoc = await db
        .collection("users")
        .doc(existingAccount.userId)
        .get();
      const connectedUser = connectedUserDoc.data();

      return res.status(409).json({
        error: "account_already_connected",
        message: `This ${platform} account is already connected to another user.`,
        details: {
          connectedToUserId: existingAccount.userId,
          connectedToOrganization: existingAccount.organizationId,
          connectedToTeam: existingAccount.teamId,
          connectionDate: existingAccount.createdAt,
          accountOwnerEmail: connectedUser?.email, // Only include if needed for admin purposes
          accountOwnerName: `${connectedUser?.firstName} ${connectedUser?.lastName}`,
          ownershipLevel: existingAccount.ownershipLevel,
        },
      });
    }

    next();
  } catch (error) {
    console.error("Error checking for duplicate social account:", error);
    res.status(500).json({
      error: "validation_failed",
      message: "Failed to validate social account operation",
    });
  }
};

export const validateOwnership = (resourceType: "social_account") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const db = firestore();
    const userId = req.user?.uid;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const [userDoc, resourceDoc] = await Promise.all([
        db.collection("users").doc(userId).get(),
        db
          .collection(resourceType + "s")
          .doc(req.params.id)
          .get(),
      ]);

      if (!resourceDoc.exists) {
        return res.status(404).json({ error: "Resource not found" });
      }

      const userData = userDoc.data();
      const resourceData = resourceDoc.data();

      // Mirror Firestore rules logic
      const hasAccess =
        (userData?.userType === "individual" &&
          resourceData?.userId === userId) ||
        (userData?.userType === "organization" &&
          (resourceData?.userId === userId ||
            userData?.teamIds?.includes(resourceData?.teamId) ||
            resourceData?.organizationId === userData?.organizationId));

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      next();
    } catch (error) {
      console.error("Ownership validation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
};
