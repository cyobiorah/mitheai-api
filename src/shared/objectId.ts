import { ObjectId } from "mongodb";

/**
 * Converts a string or ObjectId to an ObjectId instance
 * @param id String ID or ObjectId to convert
 * @returns ObjectId instance or null if conversion fails
 */
export function toObjectId(id: string | ObjectId): ObjectId | null {
  // console.log(`[DEBUG] toObjectId received: '${id}', type: ${typeof id}`);

  try {
    if (id instanceof ObjectId) {
      // console.log(`[DEBUG] toObjectId: Input is already an ObjectId. Returning it.`);
      return id;
    }

    const isValid = ObjectId.isValid(id);
    // console.log(`[DEBUG] toObjectId: ObjectId.isValid('${id}') returned: ${isValid}`);

    if (isValid) {
      const objectIdInstance = new ObjectId(id);
      // console.log(`[DEBUG] toObjectId: Successfully created new ObjectId:`, objectIdInstance);
      return objectIdInstance;
    }

    // console.log(`[DEBUG] toObjectId: Input is not a valid ObjectId string or instance. Returning null.`);
    return null;
  } catch (error) {
    console.error(
      `[ERROR] toObjectId caught an error during conversion for id: '${id}'. Error:`,
      error
    );
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
