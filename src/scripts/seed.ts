import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {
  organizations,
  teams,
  users,
  roles,
  permissions,
  features,
} from "./seedData";
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

async function seedData() {
  try {
    console.log("Starting seed process...");
    const batch = db.batch();

    // Store credentials for logging
    const credentials: Array<{email: string; password: string; userType: string}> = [];

    // Seed organizations (only for organization users)
    console.log("Seeding organizations...");
    for (const [id, org] of Object.entries(organizations)) {
      const ref = db.collection("organizations").doc(id);
      batch.set(ref, {
        ...org,
        settings: {
          ...org.settings,
          permissions: org.settings.permissions || [],
        },
      });
    }

    // Seed teams (only for organization users)
    console.log("Seeding teams...");
    for (const [id, team] of Object.entries(teams)) {
      const ref = db.collection("teams").doc(id);
      batch.set(ref, team);
    }

    // Seed roles
    console.log("Seeding roles...");
    for (const [id, role] of Object.entries(roles)) {
      const ref = db.collection("roles").doc(id);
      batch.set(ref, role);
    }

    // Seed permissions
    console.log("Seeding permissions...");
    for (const [id, permission] of Object.entries(permissions)) {
      const ref = db.collection("permissions").doc(id);
      batch.set(ref, permission);
    }

    // Seed features
    console.log("Seeding features...");
    for (const [id, feature] of Object.entries(features)) {
      const ref = db.collection("features").doc(id);
      batch.set(ref, feature);
    }

    // Seed users (both organization and individual)
    console.log("Seeding users...");
    for (const [id, user] of Object.entries(users)) {
      const ref = db.collection("users").doc(id);
      const password = "password123"; // Default password for testing
      
      // Create Firebase auth user
      try {
        await auth.createUser({
          uid: id,
          email: user.email,
          password,
          displayName: `${user.firstName} ${user.lastName}`,
        });
        console.log(`Created Firebase auth user: ${user.email}`);
        
        // Store credentials for later logging
        credentials.push({
          email: user.email,
          password,
          userType: user.userType
        });

      } catch (error: any) {
        if (error.code === 'auth/uid-already-exists') {
          console.log(`User ${user.email} already exists in Firebase Auth`);
          credentials.push({
            email: user.email,
            password,
            userType: user.userType
          });
        } else {
          throw error;
        }
      }

      // Store user data in Firestore
      batch.set(ref, {
        ...user,
        // Only include organization/team fields for organization users
        ...(user.userType === 'organization' ? {
          organizationId: user.organizationId,
          role: user.role,
          teamIds: user.teamIds
        } : {})
      });
    }

    // Commit all changes
    await batch.commit();
    console.log("Seed completed successfully!");

    // Log all account credentials
    console.log("\n=== Seeded Account Credentials ===");
    console.log("Organization Accounts:");
    credentials
      .filter(cred => cred.userType === 'organization')
      .forEach(cred => {
        console.log(`Email: ${cred.email}`);
        console.log(`Password: ${cred.password}`);
        console.log("---");
      });
    
    console.log("\nIndividual Accounts:");
    credentials
      .filter(cred => cred.userType === 'individual')
      .forEach(cred => {
        console.log(`Email: ${cred.email}`);
        console.log(`Password: ${cred.password}`);
        console.log("---");
      });

  } catch (error) {
    console.error("Error seeding data:", error);
    throw error;
  }
}

// Run the seed function
seedData().then(() => process.exit(0));
