/**
 * Firebase to MongoDB Migration Script
 *
 * This script migrates data from Firebase/Firestore to MongoDB
 * It handles the conversion of Firestore Timestamps to JavaScript Date objects
 */

import dotenv from "dotenv";
import { db, collections } from "../config/firebase";
import { MongoDBConnection, getDb } from "../config/mongodb";
import { Db, Collection } from "mongodb";
import { Timestamp } from "firebase-admin/firestore";

// Load environment variables
dotenv.config();

// Batch size for processing documents
const BATCH_SIZE = 100;

// Convert Firestore timestamp to Date
function convertTimestampToDate(data: any): any {
  if (!data) return data;

  if (data instanceof Timestamp) {
    return data.toDate();
  }

  if (Array.isArray(data)) {
    return data.map((item) => convertTimestampToDate(item));
  }

  if (typeof data === "object") {
    const result: any = {};
    for (const key in data) {
      result[key] = convertTimestampToDate(data[key]);
    }
    return result;
  }

  return data;
}

// Process a single collection
async function migrateCollection(
  firestoreCollection: FirebaseFirestore.CollectionReference,
  mongoCollection: Collection,
  collectionName: string
): Promise<void> {
  console.log(`Starting migration of ${collectionName} collection...`);

  // Get total count for progress tracking
  const snapshot = await firestoreCollection.get();
  const totalDocuments = snapshot.size;
  console.log(`Found ${totalDocuments} documents in ${collectionName}`);

  let processedCount = 0;
  let batch: any[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const convertedData = convertTimestampToDate(data);

    // Add _id field for MongoDB using the Firestore document ID
    convertedData._id = doc.id;

    batch.push(convertedData);
    processedCount++;

    // Process in batches
    if (batch.length >= BATCH_SIZE || processedCount === totalDocuments) {
      try {
        await mongoCollection.insertMany(batch);
        console.log(
          `Migrated ${batch.length} documents from ${collectionName} (${processedCount}/${totalDocuments})`
        );
        batch = [];
      } catch (error) {
        console.error(`Error migrating batch from ${collectionName}:`, error);
        // Continue with the next batch
      }
    }
  }

  console.log(`Completed migration of ${collectionName} collection`);
}

// Main migration function
async function migrateData(): Promise<void> {
  try {
    console.log("Starting Firebase to MongoDB migration...");

    // Connect to MongoDB
    const mongodb = await getDb();

    // Define collections to migrate
    const collectionsToMigrate = [
      {
        name: "users",
        firestore: collections.users,
        mongo: mongodb.collection("users"),
      },
      {
        name: "organizations",
        firestore: collections.organizations,
        mongo: mongodb.collection("organizations"),
      },
      {
        name: "teams",
        firestore: collections.teams,
        mongo: mongodb.collection("teams"),
      },
      {
        name: "invitations",
        firestore: collections.invitations,
        mongo: mongodb.collection("invitations"),
      },
      {
        name: "socialAccounts",
        firestore: collections.socialAccounts,
        mongo: mongodb.collection("socialAccounts"),
      },
      // Add other collections as needed
    ];

    // Migrate each collection
    for (const collection of collectionsToMigrate) {
      await migrateCollection(
        collection.firestore,
        collection.mongo,
        collection.name
      );
    }

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Close connections
    process.exit(0);
  }
}

// Run the migration
migrateData();
