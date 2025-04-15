import { Invitation, User } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import crypto from "crypto";
import bcrypt from "bcrypt";

export class InvitationService {
  private invitationRepository: any;
  private userRepository: any;
  private organizationRepository: any;
  private teamRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.invitationRepository =
      await RepositoryFactory.createInvitationRepository();
    this.userRepository = await RepositoryFactory.createUserRepository();
    this.organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
    this.teamRepository = await RepositoryFactory.createTeamRepository();
  }

  async findById(id: string): Promise<Invitation | null> {
    return await this.invitationRepository.findById(id);
  }

  async findByToken(token: string): Promise<Invitation | null> {
    return await this.invitationRepository.findByToken(token);
  }

  async findByEmail(email: string): Promise<Invitation[]> {
    return await this.invitationRepository.findByEmail(email);
  }

  async findPendingByOrganization(
    organizationId: string
  ): Promise<Invitation[]> {
    return await this.invitationRepository.findPendingByOrganization(
      organizationId
    );
  }

  async create(
    invitationData: Omit<
      Invitation,
      "id" | "token" | "status" | "createdAt" | "updatedAt" | "expiresAt"
    >
  ): Promise<Invitation> {
    // Check if organization exists
    const organization = await this.organizationRepository.findById(
      invitationData.organizationId
    );
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(
      invitationData.email
    );
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Generate token and expiry date
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    // Create invitation
    const newInvitation = await this.invitationRepository.create({
      ...invitationData,
      id: this.generateInvitationId(),
      token,
      status: "pending",
      expiresAt,
    } as Invitation);

    // TODO: Send invitation email

    return newInvitation;
  }

  async accept(
    token: string,
    userData: { password: string }
  ): Promise<User | null> {
    // Find invitation by token
    const invitation = await this.invitationRepository.findByToken(token);
    if (!invitation) {
      throw new Error("Invalid invitation token");
    }

    console.log(
      "Found invitation:",
      invitation.id,
      "for email:",
      invitation.email
    );

    // Check if invitation is still valid
    if (invitation.status !== "pending") {
      throw new Error("Invitation has already been used or expired");
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      await this.invitationRepository.markAsExpired(invitation.id);
      throw new Error("Invitation has expired");
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    // Find ALL users with this email to handle potential duplicates
    const existingUsers = await this.userRepository.find({
      email: invitation.email,
    });

    console.log("Found existing users:", existingUsers.length);

    // 1. Fetch the organization's default team
    const org = await this.organizationRepository.findById(
      invitation.organizationId
    );
    let defaultTeamId = "";
    if (org?.organizationSettings?.defaultTeamId) {
      defaultTeamId = org.organizationSettings.defaultTeamId;
    } else {
      // fallback: fetch first team in the org if explicit default is missing
      const teams = (await this.organizationRepository.getTeams)
        ? await this.organizationRepository.getTeams(invitation.organizationId)
        : [];
      if (teams?.length > 0) {
        defaultTeamId = teams[0]._id?.toString() ?? "";
      }
    }

    // Prepare teamIds for the user
    const userTeamIds = defaultTeamId ? [defaultTeamId] : [];

    let user;

    if (existingUsers?.length > 0) {
      // If we have multiple users with the same email, find the one with status "pending"
      // or take the first one if none have "pending" status
      const pendingUser =
        existingUsers.find((u: any) => u.status === "pending") ??
        existingUsers[0];

      console.log("Selected user to update:", pendingUser.id);

      // Update the existing user instead of creating a new one
      user = await this.userRepository.update(pendingUser.id, {
        status: "active",
        password: hashedPassword,
        teamIds: userTeamIds,
        updatedAt: new Date(),
      });

      console.log("After update, user is:", user ? "found" : "null");

      // Delete any other duplicate users with the same email
      for (const dupUser of existingUsers) {
        if (dupUser.id !== pendingUser.id) {
          console.log("Deleting duplicate user:", dupUser.id);
          await this.userRepository.delete(dupUser.id);
        }
      }
    } else {
      // Create a new user if none exists
      console.log("No existing users found, creating new user");
      user = await this.userRepository.create({
        // uid: this.generateUserId(),
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        organizationId: invitation.organizationId,
        teamIds: userTeamIds,
        userType: "organization",
        status: "active",
        settings: {
          permissions: [],
          theme: "light",
          notifications: [],
        },
        password: hashedPassword,
      } as any);

      console.log("After create, user is:", user ? "created" : "null");
    }

    // 3. Add the user to the team's memberIds if not already present
    if (defaultTeamId && user?._id) {
      // You may need to adjust this if you have a dedicated TeamRepository
      const team = (await this.organizationRepository.getTeamById)
        ? await this.organizationRepository.getTeamById(defaultTeamId)
        : null;
      if (team && !team.memberIds.includes(user._id.toString())) {
        team.memberIds = team.memberIds ?? [];
        team.memberIds.push(user._id.toString());
        if (this.organizationRepository.updateTeam) {
          await this.organizationRepository.updateTeam(defaultTeamId, {
            memberIds: team.memberIds,
          });
        } else if (this.teamRepository?.update) {
          await this.teamRepository.update(defaultTeamId, {
            memberIds: team.memberIds,
          });
        }
        // If you update teams directly via Mongo, do so here.
      }
    }

    // Mark invitation as accepted
    await this.invitationRepository.markAsAccepted(invitation.id);

    console.log("Final user object to return:", user ? "valid" : "null");

    return user;
  }

  async cancel(id: string): Promise<boolean> {
    const invitation = await this.invitationRepository.findById(id);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error("Invitation has already been used or expired");
    }

    return await this.invitationRepository.delete(id);
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private generateInvitationId(): string {
    return "inv_" + Math.random().toString(36).substr(2, 9);
  }

  // private generateUserId(): string {
  //   return "user_" + Math.random().toString(36).substr(2, 9);
  // }
}
