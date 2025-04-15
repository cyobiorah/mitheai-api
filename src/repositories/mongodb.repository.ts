import { Collection, Db, ObjectId, ModifyResult, WithId, Document } from "mongodb"; 
import { Repository } from "./base.repository";
import { toObjectId } from "../shared/objectId";

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
    return docs.map((doc) => this.formatDocument(doc)).filter(Boolean) as T[];
  }

  /**
   * Prepare query to handle both id and _id lookups, supporting both string and ObjectId formats
   */
  private prepareIdQuery(id: string): any {
    const objectId = toObjectId(id);
    
    // Try all possible formats:
    // 1. _id as ObjectId
    // 2. _id as string
    // 3. id as string
    return { 
      $or: [
        ...(objectId ? [{ _id: objectId }] : []),  // Only include if valid ObjectId
        { _id: id },     // Try as string in _id
        { id: id }       // Try as string in id field
      ]
    };
  }

  /**
   * Create a query that matches both string and ObjectId values
   * Useful for arrays that might contain mixed ID formats
   */
  protected createIdMatchQuery(field: string, value: string): any {
    const objectId = toObjectId(value);
    if (!objectId) return { [field]: value };

    // If field is an array (like memberIds), use $in to match either format
    return {
      [field]: {
        $in: [value, objectId]
      }
    };
  }

  async findById(id: string): Promise<T | null> {
    try {
      // console.log(`[DEBUG] findById called with id: ${id}, type: ${typeof id}`);

      // First try to find by _id as ObjectId
      const query = this.prepareIdQuery(id);
      // console.log(`[DEBUG] Query after prepareIdQuery:`, JSON.stringify(query));

      let doc = await this.collection.findOne(query);
      // console.log(`[DEBUG] First lookup result:`, doc ? 'Found' : 'Not found');

      // If not found and id is a valid ObjectId string, try by id field
      if (!doc && ObjectId.isValid(id)) {
        // console.log(`[DEBUG] Trying secondary lookup with id field`);
        doc = await this.collection.findOne({ id: id });
        // console.log(`[DEBUG] Secondary lookup result:`, doc ? 'Found' : 'Not found');
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

  /**
   * Convert string IDs to ObjectIds for known fields
   */
  private convertToObjectIds(data: any): any {
    const result = { ...data };
    
    // List of fields that should be ObjectIds
    const objectIdFields = ['teamId', 'organizationId', 'socialAccountId', 'userId'];
    
    for (const field of objectIdFields) {
      if (result[field]) {
        if (result[field] instanceof ObjectId) {
          // Already an ObjectId, keep as is
          continue;
        }
        if (typeof result[field] === 'string') {
          const objectId = toObjectId(result[field]);
          if (objectId) {
            result[field] = objectId;
          } else {
            // If conversion fails, set to undefined rather than null
            delete result[field];
          }
        } else {
          // If not string or ObjectId, remove the field
          delete result[field];
        }
      }
    }
    
    return result;
  }

  async create(data: Omit<T, "_id">): Promise<T> {
    // Remove any existing id field to avoid conflicts
    const dataToInsert = { ...data } as any;
    delete dataToInsert.id;

    // Convert any string IDs to ObjectIds
    const convertedData = this.convertToObjectIds(dataToInsert);

    const result = await this.collection.insertOne(convertedData);

    // Return document with both _id and id
    return this.formatDocument({
      _id: result.insertedId,
      ...convertedData,
    }) as T;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    // console.log(`[DEBUG] MongoDBRepository.update received id: '${id}' (Type: ${typeof id}, Length: ${id?.length})`);

    // Remove id from update data to avoid conflicts
    const updateData = { ...data } as any;
    delete updateData.id;
    delete updateData._id;

    // Convert known ObjectId fields in updateData
    if (updateData.teamId && typeof updateData.teamId === 'string') {
      const teamObjectId = toObjectId(updateData.teamId);
      if (teamObjectId) {
        updateData.teamId = teamObjectId;
      }
    }

    if (updateData.organizationId && typeof updateData.organizationId === 'string') {
      const orgObjectId = toObjectId(updateData.organizationId);
      if (orgObjectId) {
        updateData.organizationId = orgObjectId;
      }
    }

    try {
      // console.log(`Updating document with id: ${id}`);
      const query = this.prepareIdQuery(id);

      // Log the query and updateData before MongoDB type conversion
      // console.log(`[DEBUG] Generated Query:`, query);  // Don't stringify to preserve ObjectId
      // console.log(`[DEBUG] Update Data:`, updateData);  // Don't stringify

      const updatedDocResult: WithId<Document> | null = await this.collection.findOneAndUpdate(
        query,
        { $set: updateData },
        { returnDocument: "after" }
      );

      // console.log(`[DEBUG] Raw findOneAndUpdate result object:`, updatedDocResult);

      if (!updatedDocResult) {
        console.log(`Update failed for id: ${id}. Reason: No document found matching the query.`);
        return null;
      }

      return this.formatDocument(updatedDocResult);
    } catch (error) {
      console.error(`Error caught during update for id: ${id}. Error:`, error);
      return null;
    }
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
