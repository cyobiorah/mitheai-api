import { Db } from "mongodb";
import { MongoDBRepository } from "../repositories/mongodb.repository";
import { Organization } from "../appTypes";

export class OrganizationRepository extends MongoDBRepository<Organization> {
  constructor(db: Db) {
    super(db, "organizations");
  }

  // Organization-specific methods
  async findByName(name: string): Promise<Organization | null> {
    return await this.findOne({ name });
  }

  async findByType(type: Organization["type"]): Promise<Organization[]> {
    return await this.find({ type });
  }

  async findWithTeamLimit(maxTeams: number): Promise<Organization[]> {
    return await this.find({ "settings.maxTeams": { $lte: maxTeams } });
  }

  // Handle dates when creating/updating
  async create(data: Omit<Organization, "_id">): Promise<Organization> {
    const now = new Date();

    const mongoData = {
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    return await super.create(mongoData);
  }

  async update(
    id: string,
    data: Partial<Organization>
  ): Promise<Organization | null> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    return await super.update(id, updateData);
  }
}
