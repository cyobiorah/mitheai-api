import { SocialAccount } from "../models/social-account.model";
import { RepositoryFactory } from "../repositories/repository.factory";

export class SocialAccountService {
  private socialAccountRepository: any;
  private userRepository: any;
  private teamRepository: any;
  private organizationRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.socialAccountRepository =
      await RepositoryFactory.createSocialAccountRepository();
    this.userRepository = await RepositoryFactory.createUserRepository();
    this.teamRepository = await RepositoryFactory.createTeamRepository();
    this.organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
  }

  async findById(id: string): Promise<SocialAccount | null> {
    return await this.socialAccountRepository.findById(id);
  }

  async findByUser(userId: string): Promise<SocialAccount[]> {
    return await this.socialAccountRepository.findByUser(userId);
  }

  async findByTeam(teamId: string): Promise<SocialAccount[]> {
    return await this.socialAccountRepository.findByTeam(teamId);
  }

  async findByOrganization(organizationId: string): Promise<SocialAccount[]> {
    return await this.socialAccountRepository.findByOrganization(
      organizationId
    );
  }

  async findByPlatformId(
    platform: SocialAccount["platform"],
    platformAccountId: string
  ): Promise<SocialAccount | null> {
    return await this.socialAccountRepository.findByPlatformId(
      platform,
      platformAccountId
    );
  }

  async create(
    accountData: Omit<SocialAccount, "id" | "createdAt" | "updatedAt">
  ): Promise<SocialAccount> {
    // Check if user exists
    const user = await this.userRepository.findById(accountData.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if account already exists for this platform
    const existingAccount = await this.findByPlatformId(
      accountData.platform,
      accountData.platformAccountId
    );
    if (existingAccount) {
      throw new Error(
        "This social account is already connected to another user"
      );
    }

    // Validate ownership level
    if (accountData.ownershipLevel === "team" && !accountData.teamId) {
      throw new Error("Team ID is required for team ownership level");
    }

    if (
      accountData.ownershipLevel === "organization" &&
      !accountData.organizationId
    ) {
      throw new Error(
        "Organization ID is required for organization ownership level"
      );
    }

    // Create social account
    const newAccount = await this.socialAccountRepository.create({
      ...accountData,
      id: this.generateAccountId(),
      status: accountData.status || "active",
    } as SocialAccount);

    return newAccount;
  }

  async update(
    id: string,
    accountData: Partial<SocialAccount>
  ): Promise<SocialAccount | null> {
    return await this.socialAccountRepository.update(id, accountData);
  }

  async delete(id: string): Promise<boolean> {
    return await this.socialAccountRepository.delete(id);
  }

  async refreshToken(
    id: string,
    newTokenData: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiry?: Date;
    }
  ): Promise<SocialAccount | null> {
    const account = await this.socialAccountRepository.findById(id);
    if (!account) {
      throw new Error("Social account not found");
    }

    const updateData: Partial<SocialAccount> = {
      accessToken: newTokenData.accessToken,
      lastRefreshed: new Date(),
      status: "active",
    };

    if (newTokenData.refreshToken) {
      updateData.refreshToken = newTokenData.refreshToken;
    }

    if (newTokenData.tokenExpiry) {
      updateData.tokenExpiry = newTokenData.tokenExpiry;
      updateData.metadata = {
        ...account.metadata,
        tokenExpiresAt: newTokenData.tokenExpiry,
      };
    }

    return await this.socialAccountRepository.update(id, updateData);
  }

  async transferOwnership(
    id: string,
    newOwnerData: {
      userId: string;
      ownershipLevel: SocialAccount["ownershipLevel"];
      teamId?: string;
      organizationId?: string;
    }
  ): Promise<SocialAccount | null> {
    const account = await this.socialAccountRepository.findById(id);
    if (!account) {
      throw new Error("Social account not found");
    }

    // Check if new owner exists
    const newOwner = await this.userRepository.findById(newOwnerData.userId);
    if (!newOwner) {
      throw new Error("New owner user not found");
    }

    // Validate ownership level
    if (newOwnerData.ownershipLevel === "team" && !newOwnerData.teamId) {
      throw new Error("Team ID is required for team ownership level");
    }

    if (
      newOwnerData.ownershipLevel === "organization" &&
      !newOwnerData.organizationId
    ) {
      throw new Error(
        "Organization ID is required for organization ownership level"
      );
    }

    // Transfer ownership
    return await this.socialAccountRepository.update(id, {
      userId: newOwnerData.userId,
      ownershipLevel: newOwnerData.ownershipLevel,
      teamId: newOwnerData.teamId,
      organizationId: newOwnerData.organizationId,
    });
  }

  private generateAccountId(): string {
    return "sa_" + Math.random().toString(36).substr(2, 9);
  }
}
