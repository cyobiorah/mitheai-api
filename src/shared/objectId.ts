import { ObjectId } from 'mongodb';

/**
 * Converts a string or ObjectId to an ObjectId instance
 * @param id String ID or ObjectId to convert
 * @returns ObjectId instance or null if conversion fails
 */
export function toObjectId(id: string | ObjectId): ObjectId | null {
  try {
    if (id instanceof ObjectId) return id;
    if (ObjectId.isValid(id)) return new ObjectId(id);
    return null;
  } catch (error) {
    console.error(`Failed to convert to ObjectId: ${id}`, error);
    return null;
  }
}

/**
 * Checks if a string or ObjectId is a valid MongoDB ObjectId
 * @param id String ID or ObjectId to validate
 * @returns boolean indicating if the ID is valid
 */
export function isValidObjectId(id: string | ObjectId): boolean {
  return toObjectId(id) !== null;
}
