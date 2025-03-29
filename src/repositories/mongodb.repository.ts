import { Collection, Db, ObjectId } from "mongodb";
import { Repository } from "./base.repository";

export class MongoDBRepository<T> implements Repository<T> {
  private readonly collection: Collection;

  constructor(db: Db, collectionName: string) {
    this.collection = db.collection(collectionName);
  }

  async findById(id: string): Promise<T | null> {
    return (await this.collection.findOne({
      _id: new ObjectId(id),
    })) as T | null;
  }

  async findOne(query: any): Promise<T | null> {
    return (await this.collection.findOne(query)) as T | null;
  }

  async find(query: any, options?: any): Promise<T[]> {
    return (await this.collection.find(query, options).toArray()) as T[];
  }

  async create(data: Omit<T, "_id">): Promise<T> {
    const result = await this.collection.insertOne(data as any);
    return { _id: result.insertedId, ...data } as unknown as T;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: "after" }
    );
    return result && result.value ? result.value as T : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }
}
