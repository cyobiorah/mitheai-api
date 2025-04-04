import { Db } from "mongodb";
import { getDb, getCollections } from "../config/mongodb";
import { UserRepository } from "./user.repository";
import { OrganizationRepository } from "./organization.repository";
import { TeamRepository } from "./team.repository";
import { SocialAccountRepository } from "./social-account.repository";
import { InvitationRepository } from "./invitation.repository";
import { SocialPostRepository } from "./social-post.repository";

export class RepositoryFactory {
  private static db: Db;

  private static async getDatabase(): Promise<Db> {
    if (!this.db) {
      this.db = await getDb();
    }
    return this.db;
  }

  static async createUserRepository(): Promise<UserRepository> {
    const db = await this.getDatabase();
    return new UserRepository(db);
  }

  static async createOrganizationRepository(): Promise<OrganizationRepository> {
    const db = await this.getDatabase();
    return new OrganizationRepository(db);
  }

  static async createTeamRepository(): Promise<TeamRepository> {
    const db = await this.getDatabase();
    return new TeamRepository(db);
  }

  static async createSocialAccountRepository(): Promise<SocialAccountRepository> {
    const db = await this.getDatabase();
    return new SocialAccountRepository(db);
  }

  static async createInvitationRepository(): Promise<InvitationRepository> {
    const db = await this.getDatabase();
    return new InvitationRepository(db);
  }

  static async createSocialPostRepository(): Promise<SocialPostRepository> {
    const collections = await getCollections();
    return new SocialPostRepository(collections.socialPosts);
  }
}
