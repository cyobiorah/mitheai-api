import { Db } from "mongodb";
import { MongoDBRepository } from "../repositories/mongodb.repository";
import { Team } from "../types";
import { toObjectId, isValidObjectId } from "../shared/objectId";

export class TeamRepository extends MongoDBRepository<Team> {
  constructor(db: Db) {
    super(db, "teams");
  }

  // Team-specific methods
  async findByOrganization(organizationId: string): Promise<Team[]> {
    const objectId = toObjectId(organizationId);
    return await this.find({
      organizationId: {
        $in: [organizationId, ...(objectId ? [objectId] : [])],
      },
    });
  }

  async findByMember(userId: string): Promise<Team[]> {
    const objectId = toObjectId(userId);
    const query = {
      $or: [
        { memberIds: userId }, // Check string format
        ...(objectId ? [{ memberIds: objectId }] : []) // Check ObjectId format if valid
      ]
    };
    return await this.find(query);
  }

  async addMember(teamId: string, userId: string): Promise<Team | null> {
    if (!isValidObjectId(teamId)) {
      console.error(`Invalid ObjectId for team member addition: ${teamId}`);
      return null;
    }

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
    if (!isValidObjectId(teamId)) {
      console.error(`Invalid ObjectId for team member removal: ${teamId}`);
      return null;
    }

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
    if (!isValidObjectId(id)) {
      console.error(`Invalid ObjectId for team update: ${id}`);
      return null;
    }

    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    return await super.update(id, updateData);
  }
}
