import { Collection, Db, ObjectId } from "mongodb";
import { Repository } from "./base.repository";

export class MongoDBRepository<T> implements Repository<T> {
  private readonly collection: Collection;

  constructor(db: Db, collectionName: string) {
    this.collection = db.collection(collectionName);
  }

  /**
   * Converts MongoDB _id to string id and ensures consistent document format
   * @param doc Document from MongoDB
   * @returns Document with consistent id format
   */
  private formatDocument(doc: any): T | null {
    if (!doc) return null;
    
    // If the document has _id, add id property as string
    if (doc._id) {
      doc.id = doc._id.toString();
    }
    
    return doc as T;
  }

  /**
   * Format multiple documents
   */
  private formatDocuments(docs: any[]): T[] {
    return docs.map(doc => this.formatDocument(doc)).filter(Boolean) as T[];
  }

  /**
   * Prepare query to handle both id and _id lookups
   */
  private prepareIdQuery(id: string): any {
    try {
      // Try to convert to ObjectId for _id lookup
      return { _id: new ObjectId(id) };
    } catch (e) {
      // If not a valid ObjectId, look up by string id
      return { id: id };
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      // First try to find by _id as ObjectId
      let doc = await this.collection.findOne(this.prepareIdQuery(id));
      
      // If not found and id is a valid ObjectId string, try by id field
      if (!doc && ObjectId.isValid(id)) {
        doc = await this.collection.findOne({ id: id });
      }
      
      return this.formatDocument(doc);
    } catch (error) {
      console.error("Error in findById:", error);
      return null;
    }
  }

  async findOne(query: any): Promise<T | null> {
    const doc = await this.collection.findOne(query);
    return this.formatDocument(doc);
  }

  async find(query: any, options?: any): Promise<T[]> {
    const docs = await this.collection.find(query, options).toArray();
    return this.formatDocuments(docs);
  }

  async create(data: Omit<T, "_id">): Promise<T> {
    // Remove any existing id field to avoid conflicts
    const dataToInsert = { ...data } as any;
    delete dataToInsert.id;
    
    const result = await this.collection.insertOne(dataToInsert);
    
    // Return document with both _id and id
    return this.formatDocument({
      _id: result.insertedId,
      ...dataToInsert
    }) as T;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    // Remove id from update data to avoid conflicts
    const updateData = { ...data } as any;
    delete updateData.id;
    delete updateData._id;
    
    // Try to update using the query builder that handles both id types
    const result = await this.collection.findOneAndUpdate(
      this.prepareIdQuery(id),
      { $set: updateData },
      { returnDocument: "after" }
    );
    
    return result && result.value ? this.formatDocument(result.value) : null;
  }

  async delete(id: string): Promise<boolean> {
    try {
      // Try to delete using the query builder that handles both id types
      const result = await this.collection.deleteOne(this.prepareIdQuery(id));
      return result.deletedCount === 1;
    } catch (error) {
      console.error("Error in delete:", error);
      return false;
    }
  }
}
