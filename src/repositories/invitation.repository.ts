import { Db } from "mongodb";
import { MongoDBRepository } from "./mongodb.repository";
import { Invitation } from "../types";

export class InvitationRepository extends MongoDBRepository<Invitation> {
  constructor(db: Db) {
    super(db, "invitations");
  }

  // Invitation-specific methods
  async findByEmail(email: string): Promise<Invitation[]> {
    return await this.find({ email });
  }

  async findByToken(token: string): Promise<Invitation | null> {
    return await this.findOne({ token });
  }

  async findPendingByOrganization(organizationId: string): Promise<Invitation[]> {
    const now = new Date();
    return await this.find({ 
      organizationId, 
      status: "pending",
      expiresAt: { $gt: now }
    });
  }

  async markAsAccepted(id: string): Promise<Invitation | null> {
    return await this.update(id, { 
      status: "accepted"
    });
  }

  async markAsExpired(id: string): Promise<Invitation | null> {
    return await this.update(id, { 
      status: "expired"
    });
  }

  // Handle dates when creating/updating
  async create(data: Omit<Invitation, "_id">): Promise<Invitation> {
    const now = new Date();
    
    const mongoData = {
      ...data,
      expiresAt: data.expiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Default 7 days expiry
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
    
    return await super.create(mongoData);
  }

  async update(id: string, data: Partial<Invitation>): Promise<Invitation | null> {
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    return await super.update(id, updateData);
  }
}
