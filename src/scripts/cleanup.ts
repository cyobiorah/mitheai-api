import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config();

// Initialize Firebase Admin
const app = admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  } as admin.ServiceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

async function cleanup() {
  try {
    console.log("Starting cleanup process...");

    // Delete all documents from collections
    const collections = [
      "organizations",
      "teams",
      "users",
      "roles",
      "permissions",
      "features",
    ];

    for (const collectionName of collections) {
      console.log(`Cleaning up ${collectionName}...`);
      const snapshot = await db.collection(collectionName).get();

      if (snapshot.empty) {
        console.log(`No documents found in ${collectionName}`);
        continue;
      }

      // Use batches to delete documents (Firestore has limits on batch operations)
      const batchSize = 500;
      const batches = [];
      let batch = db.batch();
      let operationCount = 0;

      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        operationCount++;

        if (operationCount === batchSize) {
          batches.push(batch.commit());
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        batches.push(batch.commit());
      }

      await Promise.all(batches);
      console.log(`Deleted ${snapshot.size} documents from ${collectionName}`);
    }

    // Delete all users from Firebase Auth
    console.log("Cleaning up Firebase Auth users...");
    const listUsersResult = await auth.listUsers();

    if (listUsersResult.users.length === 0) {
      console.log("No users found in Firebase Auth");
    } else {
      const userDeletions = listUsersResult.users.map((user) =>
        auth
          .deleteUser(user.uid)
          .catch((error) =>
            console.error(`Failed to delete user ${user.uid}:`, error)
          )
      );

      await Promise.all(userDeletions);
      console.log(
        `Deleted ${listUsersResult.users.length} users from Firebase Auth`
      );
    }

    console.log("Cleanup completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
}

// Run the cleanup function
cleanup();
