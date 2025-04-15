import { Db } from "mongodb";
import { MongoDBRepository } from "../repositories/mongodb.repository";
import { User } from "../appTypes";
import { toObjectId } from "../shared/objectId";

export class UserRepository extends MongoDBRepository<User> {
  constructor(db: Db) {
    super(db, "users");
  }

  // Add user-specific methods here
  async findByEmail(email: string): Promise<User | null> {
    return await this.findOne({ email });
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    return await this.find({ organizationId });
  }

  async findByTeam(teamId: string): Promise<User[]> {
    const objectId = toObjectId(teamId);
    const query = {
      teamIds: {
        $in: [teamId, ...(objectId ? [objectId] : [])]
      }
    };
    return await this.find(query);
  }

  async findById(id: string): Promise<User | null> {
    try {
      // First try to find by uid (non-ObjectId field)
      let user = await this.findOne({ uid: id });
      if (user) return user;
      
      // Then try to find by _id using the base repository method
      return await super.findById(id);
    } catch (error) {
      console.error("Error in UserRepository.findById:", error);
      return null;
    }
  }
}
