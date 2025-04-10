import { Db, Collection, ObjectId } from "mongodb";
import { MongoDBRepository } from "../repositories/mongodb.repository";
import { SocialAccount } from "./socialAccount.model";
import { toObjectId } from "../shared/objectId";

export interface ScheduledTweet {
  _id?: string | ObjectId;
  socialAccountId: string;
  content: string;
  scheduledFor: Date;
  status: "pending" | "sent" | "failed";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SocialAccountRepository extends MongoDBRepository<SocialAccount> {
  private scheduledTweetsCollection: Collection;

  constructor(db: Db) {
    super(db, "socialAccounts");
    this.scheduledTweetsCollection = db.collection("scheduledTweets");
  }

  // Social account-specific methods
  async findByPlatformId(
    platform: SocialAccount["platform"],
    platformAccountId: string
  ): Promise<SocialAccount | null> {
    return await this.findOne({ platform, platformAccountId });
  }

  async findByUser(userId: string): Promise<SocialAccount[]> {
    return await this.find({ userId });
  }

  async findByTeam(teamId: string): Promise<SocialAccount[]> {
    return await this.find({ teamId });
  }

  async findByOrganization(organizationId: string): Promise<SocialAccount[]> {
    return await this.find({ organizationId });
  }

  async findActive(): Promise<SocialAccount[]> {
    return await this.find({ status: "active" });
  }

  // Handle dates when creating/updating
  async create(data: Omit<SocialAccount, "_id">): Promise<SocialAccount> {
    const now = new Date();

    const mongoData = {
      ...data,
      tokenExpiry: data.tokenExpiry || null,
      lastRefreshed: data.lastRefreshed || now,
      metadata: {
        ...data.metadata,
        lastChecked: data.metadata?.lastChecked || undefined,
        tokenExpiresAt: data.metadata?.tokenExpiresAt || undefined,
      },
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    return await super.create(mongoData);
  }

  async update(
    id: string,
    data: Partial<SocialAccount>
  ): Promise<SocialAccount | null> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    };

    return await super.update(id, updateData);
  }

  // Scheduled tweets methods
  async createScheduledTweet(
    data: Omit<ScheduledTweet, "_id">
  ): Promise<ScheduledTweet> {
    const now = new Date();
    const tweetData = {
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    const result = await this.scheduledTweetsCollection.insertOne(tweetData);
    return { _id: result.insertedId, ...tweetData };
  }

  async findScheduledTweets(
    query: Partial<ScheduledTweet>
  ): Promise<ScheduledTweet[]> {
    // If query contains _id, convert it to ObjectId
    const mongoQuery: any = { ...query };
    if (query._id) {
      const objectId = toObjectId(query._id.toString());
      if (objectId) {
        mongoQuery._id = objectId;
      }
    }

    return (await this.scheduledTweetsCollection
      .find(mongoQuery)
      .toArray()) as unknown as ScheduledTweet[];
  }

  async updateScheduledTweet(
    id: string,
    data: Partial<ScheduledTweet>
  ): Promise<boolean> {
    const objectId = toObjectId(id);
    if (!objectId) {
      console.error(`Invalid ObjectId for scheduled tweet update: ${id}`);
      return false;
    }

    const result = await this.scheduledTweetsCollection.updateOne(
      { _id: objectId },
      { $set: { ...data, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }

  async findScheduledTweetById(id: string): Promise<ScheduledTweet | null> {
    const objectId = toObjectId(id);
    if (!objectId) {
      console.error(`Invalid ObjectId for scheduled tweet lookup: ${id}`);
      return null;
    }

    const tweet = await this.scheduledTweetsCollection.findOne({
      _id: objectId,
    });
    return tweet as unknown as ScheduledTweet | null;
  }

  async findPendingScheduledTweets(): Promise<ScheduledTweet[]> {
    return (await this.scheduledTweetsCollection
      .find({
        status: "pending",
        scheduledFor: { $lte: new Date() },
      })
      .toArray()) as unknown as ScheduledTweet[];
  }

  async deleteScheduledTweet(id: string): Promise<boolean> {
    const objectId = toObjectId(id);
    if (!objectId) {
      console.error(`Invalid ObjectId for scheduled tweet deletion: ${id}`);
      return false;
    }

    const result = await this.scheduledTweetsCollection.deleteOne({
      _id: objectId,
    });
    return result.deletedCount === 1;
  }
}
