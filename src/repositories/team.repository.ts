import { Db } from "mongodb";
import { MongoDBRepository } from "./mongodb.repository";
import { Team } from "../types";

export class TeamRepository extends MongoDBRepository<Team> {
  constructor(db: Db) {
    super(db, "teams");
  }

  // Team-specific methods
  async findByOrganization(organizationId: string): Promise<Team[]> {
    return await this.find({ organizationId });
  }

  async findByMember(userId: string): Promise<Team[]> {
    return await this.find({ memberIds: userId });
  }

  async addMember(teamId: string, userId: string): Promise<Team | null> {
    const team = await this.findById(teamId);
    if (!team) return null;

    if (!team.memberIds.includes(userId)) {
      return await this.update(teamId, {
        memberIds: [...team.memberIds, userId],
      });
    }
    return team;
  }

  async removeMember(teamId: string, userId: string): Promise<Team | null> {
    const team = await this.findById(teamId);
    if (!team) return null;

    return await this.update(teamId, {
      memberIds: team.memberIds.filter((id) => id !== userId),
    });
  }

  // Handle dates when creating/updating
  async create(data: Omit<Team, "_id">): Promise<Team> {
    const now = new Date();
    
    const mongoData = {
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
    
    return await super.create(mongoData);
  }
  
  async update(id: string, data: Partial<Team>): Promise<Team | null> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };
    
    return await super.update(id, updateData);
  }
}
