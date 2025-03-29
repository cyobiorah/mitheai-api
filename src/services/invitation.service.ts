import { Invitation, User } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import crypto from "crypto";

export class InvitationService {
  private invitationRepository: any;
  private userRepository: any;
  private organizationRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.invitationRepository =
      await RepositoryFactory.createInvitationRepository();
    this.userRepository = await RepositoryFactory.createUserRepository();
    this.organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
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

    // Check if invitation is still valid
    if (invitation.status !== "pending") {
      throw new Error("Invitation has already been used or expired");
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      await this.invitationRepository.markAsExpired(invitation.id);
      throw new Error("Invitation has expired");
    }

    // Create user from invitation
    const user = await this.userRepository.create({
      uid: this.generateUserId(),
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      role: invitation.role,
      organizationId: invitation.organizationId,
      teamIds: invitation.teamIds,
      userType: "organization",
      status: "active",
      settings: {
        permissions: [],
        theme: "light",
        notifications: [],
      },
      password: userData.password, // Note: This should be hashed in the UserRepository
    } as any);

    // Mark invitation as accepted
    await this.invitationRepository.markAsAccepted(invitation.id);

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

  private generateUserId(): string {
    return "user_" + Math.random().toString(36).substr(2, 9);
  }
}
