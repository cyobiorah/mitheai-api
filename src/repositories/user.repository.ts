import { Db } from "mongodb";
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
}
