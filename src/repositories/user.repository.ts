import { Db, ObjectId } from "mongodb";
import { MongoDBRepository } from "./mongodb.repository";
import { User } from "../app-types";

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

  async findById(id: string): Promise<User | null> {
    try {
      // Convert string ID to MongoDB ObjectId
      const objectId = new ObjectId(id);
      return await this.findOne({ _id: objectId });
    } catch (error) {
      console.error("Error converting to ObjectId:", error);
      return null;
    }
  }
}
