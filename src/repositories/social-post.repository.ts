import { Collection, ObjectId } from "mongodb";
import { SocialPost } from "../models/social-post.model";

export class SocialPostRepository {
  private collection: Collection;

  constructor(collection: Collection) {
    this.collection = collection;
  }

  async createPost(post: SocialPost): Promise<SocialPost> {
    const now = new Date();

    // Create a new object without the _id if it's a string
    const { _id, ...postData } = post;

    // Prepare the document for insertion
    const postToInsert = {
      ...postData,
      // Only include _id if it's already an ObjectId
      ...(typeof _id !== "string" && _id ? { _id } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.collection.insertOne(postToInsert);
    return { ...postToInsert, _id: result.insertedId };
  }

  async getPostById(id: string): Promise<SocialPost | null> {
    return this.collection.findOne({
      _id: new ObjectId(id),
    }) as unknown as SocialPost | null;
  }

  async getPostsByUserId(userId: string): Promise<SocialPost[]> {
    return this.collection
      .find({ userId })
      .toArray() as unknown as SocialPost[];
  }

  async getPostsBySocialAccountId(
    socialAccountId: string
  ): Promise<SocialPost[]> {
    return this.collection
      .find({ socialAccountId })
      .toArray() as unknown as SocialPost[];
  }

  async updatePostAnalytics(
    id: string,
    analytics: Partial<SocialPost>
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...analytics,
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async getPosts(
    filter: any = {},
    sort: any = { publishedDate: -1 }
  ): Promise<SocialPost[]> {
    return this.collection
      .find(filter)
      .sort(sort)
      .toArray() as unknown as SocialPost[];
  }

  async deletePost(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }
}
