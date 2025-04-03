// import { Request, Response } from "express";
// import { User, Organization, Team } from "../types";
// import { v4 as uuidv4 } from "uuid";
// import { sendInvitationEmail } from "../services/email.service";

// interface Invitation {
//   id: string;
//   email: string;
//   firstName: string;
//   lastName: string;
//   role: User["role"];
//   organizationId: string;
//   token: string;
//   status: "pending" | "accepted" | "expired";
//   teamIds: string[];
//   expiresAt: string;
//   createdAt: string;
//   updatedAt: string;
// }

// export const createInvitation = async (req: Request, res: Response) => {
//   try {
//     const { email, firstName, lastName, role, organizationId, teamIds } =
//       req.body;

//     if (!email || !firstName || !lastName || !role || !organizationId) {
//       return res.status(400).json({
//         error:
//           "Missing required fields: email, firstName, lastName, role, organizationId",
//       });
//     }

//     // Check if user already exists
//     const existingUsers = await db
//       .collection("users")
//       .where("email", "==", email)
//       .where("organizationId", "==", organizationId)
//       .get();

//     if (!existingUsers.empty) {
//       return res.status(400).json({
//         error: "User with this email already exists in the organization",
//       });
//     }

//     // Get organization name for the email
//     console.log("Fetching organization:", organizationId);
//     const orgDoc = await db
//       .collection("organizations")
//       .doc(organizationId)
//       .get();
//     if (!orgDoc.exists) {
//       console.error("Organization not found:", organizationId);
//       return res.status(404).json({ error: "Organization not found" });
//     }
//     const organization = orgDoc.data() as Organization;
//     // console.log("Found organization:", organization);

//     // Create invitation token
//     const token = uuidv4();
//     const expiresAt = new Date();
//     expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

//     const invitation: Omit<Invitation, "id"> = {
//       email,
//       firstName,
//       lastName,
//       role,
//       organizationId,
//       token,
//       status: "pending",
//       teamIds: teamIds || [],
//       expiresAt: expiresAt.toISOString(),
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     };

//     // Store invitation in Firestore
//     console.log("Creating invitation with token:", token);
//     console.log(
//       "Full invitation data to be stored:",
//       JSON.stringify(invitation, null, 2)
//     );

//     try {
//       const invitationRef = await db.collection("invitations").add(invitation);
//       console.log("Created invitation with ID:", invitationRef.id);

//       const invitationDoc = await invitationRef.get();
//       if (!invitationDoc.exists) {
//         console.error("Failed to create invitation document");
//         return res.status(500).json({ error: "Failed to create invitation" });
//       }

//       console.log(
//         "Created invitation document data:",
//         JSON.stringify(invitationDoc.data(), null, 2)
//       );

//       // Send invitation email
//       console.log(
//         "Sending invitation email with organization:",
//         organization.name
//       );
//       await sendInvitationEmail({
//         to: email,
//         firstName,
//         lastName,
//         invitationToken: token,
//         organizationName: organization.name,
//       });

//       res.status(201).json({
//         id: invitationDoc.id,
//         ...invitationDoc.data(),
//       });
//     } catch (error) {
//       console.error("Error creating invitation:", error);
//       return res.status(500).json({ error: "Failed to create invitation" });
//     }
//   } catch (error) {
//     console.error("Error creating invitation:", error);
//     res.status(500).json({ error: "Failed to create invitation" });
//   }
// };

// export const verifyInvitation = async (req: Request, res: Response) => {
//   try {
//     const { token } = req.params;

//     if (!token) {
//       return res.status(400).json({ error: "Token is required" });
//     }

//     // Find user by invitation token
//     const usersSnapshot = await db
//       .collection("users")
//       .where("invitationToken", "==", token)
//       .where("status", "==", "pending")
//       .get();

//     if (usersSnapshot.empty) {
//       return res.status(404).json({ error: "Invalid or expired invitation" });
//     }

//     const userDoc = usersSnapshot.docs[0];
//     const userData = userDoc.data() as User;

//     if (!userData.organizationId) {
//       return res.status(404).json({ error: "Organization not found" });
//     }

//     // Get organization name
//     const orgDoc = await db
//       .collection("organizations")
//       .doc(userData.organizationId)
//       .get();
//     if (!orgDoc.exists) {
//       return res.status(404).json({ error: "Organization not found" });
//     }
//     const organization = orgDoc.data() as Organization;

//     res.json({
//       email: userData.email,
//       firstName: userData.firstName,
//       lastName: userData.lastName,
//       organizationName: organization.name,
//     });
//   } catch (error) {
//     console.error("Error verifying invitation:", error);
//     res.status(500).json({ error: "Failed to verify invitation" });
//   }
// };

// export const acceptInvitation = async (req: Request, res: Response) => {
//   try {
//     console.log("Accept invitation request:", {
//       params: req.params,
//       body: req.body,
//       url: req.url,
//     });

//     const { token } = req.params;
//     const { password } = req.body;

//     if (!token || !password) {
//       return res.status(400).json({ error: "Token and password are required" });
//     }

//     // First find the pending user with this invitation token
//     console.log("Looking for user with invitation token:", token);
//     const pendingUsersSnapshot = await db
//       .collection("users")
//       .where("invitationToken", "==", token)
//       .where("status", "==", "pending")
//       .get();

//     // console.log("Found pending users:", pendingUsersSnapshot.size);
//     if (pendingUsersSnapshot.empty) {
//       return res.status(404).json({ error: "Invalid or expired invitation" });
//     }

//     const pendingUserDoc = pendingUsersSnapshot.docs[0];
//     const pendingUser = pendingUserDoc.data() as User;

//     // Create Firebase Auth user
//     let userRecord;
//     try {
//       userRecord = await auth.createUser({
//         email: pendingUser.email,
//         password,
//         displayName: `${pendingUser.firstName} ${pendingUser.lastName}`,
//         emailVerified: false,
//       });
//     } catch (error: any) {
//       console.error("Error creating Firebase user:", error);
//       if (error.code === "auth/email-already-exists") {
//         return res
//           .status(400)
//           .json({ error: "An account with this email already exists" });
//       }
//       throw error;
//     }

//     // Use a batch to update everything atomically
//     const batch = db.batch();

//     // Create new user document with the Firebase uid
//     const newUserRef = db.collection("users").doc(userRecord.uid);
//     batch.set(newUserRef, {
//       ...pendingUser,
//       uid: userRecord.uid,
//       status: "active",
//       invitationToken: null,
//       updatedAt: new Date().toISOString(),
//     });

//     // Delete the old pending user document
//     batch.delete(pendingUserDoc.ref);

//     await batch.commit();

//     // Send verification email
//     await auth.generateEmailVerificationLink(pendingUser.email);

//     res.json({
//       message: "Account created successfully",
//       email: pendingUser.email,
//       requiresVerification: true,
//     });
//   } catch (error) {
//     console.error("Error accepting invitation:", error);
//     res.status(500).json({ error: "Failed to accept invitation" });
//   }
// };

// export const resendInvitation = async (req: Request, res: Response) => {
//   try {
//     const { email } = req.body;

//     if (!email) {
//       return res.status(400).json({ error: "Email is required" });
//     }

//     // Find user by email and ensure they are in pending status
//     const usersSnapshot = await db
//       .collection("users")
//       .where("email", "==", email)
//       .where("status", "==", "pending")
//       .get();

//     if (usersSnapshot.empty) {
//       return res
//         .status(404)
//         .json({ error: "No pending invitation found for this email" });
//     }

//     const userDoc = usersSnapshot.docs[0];
//     const userData = userDoc.data() as User;

//     if (!userData.firstName || !userData.lastName || !userData.organizationId) {
//       return res.status(500).json({ error: "Invalid user data" });
//     }

//     // Get organization name for the email
//     const orgDoc = await db
//       .collection("organizations")
//       .doc(userData.organizationId)
//       .get();
//     if (!orgDoc.exists) {
//       return res.status(404).json({ error: "Organization not found" });
//     }
//     const organization = orgDoc.data() as Organization;

//     // Generate new invitation token and expiry
//     const newToken = uuidv4();
//     const expiresAt = new Date();
//     expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

//     // Create or update invitation in Firestore
//     const invitationData = {
//       email,
//       firstName: userData.firstName,
//       lastName: userData.lastName,
//       role: userData.role,
//       organizationId: userData.organizationId,
//       token: newToken,
//       status: "pending",
//       teamIds: userData.teamIds || [],
//       expiresAt: expiresAt.toISOString(),
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     };

//     // Store invitation in Firestore
//     await db.collection("invitations").doc(newToken).set(invitationData);

//     // Update user with new token
//     await userDoc.ref.update({
//       invitationToken: newToken,
//       updatedAt: new Date().toISOString(),
//     });

//     // Send new invitation email
//     await sendInvitationEmail({
//       to: email,
//       firstName: userData.firstName, // Now guaranteed to be string
//       lastName: userData.lastName, // Now guaranteed to be string
//       invitationToken: newToken,
//       organizationName: organization.name,
//     });

//     res.json({ message: "Invitation resent successfully" });
//   } catch (error) {
//     console.error("Error resending invitation:", error);
//     res.status(500).json({ error: "Failed to resend invitation" });
//   }
// };
