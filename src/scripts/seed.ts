import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import { organizations, teams, users, roles, permissions, features } from './seedData';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS || ''),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

async function seedData() {
  try {
    console.log('Starting seed process...');

    // Create collections in batch
    const batch = db.batch();

    // Seed organizations
    console.log('Seeding organizations...');
    for (const [id, org] of Object.entries(organizations)) {
      const ref = db.collection('organizations').doc(id);
      batch.set(ref, {
        ...org,
        settings: {
          ...org.settings,
          permissions: org.settings.permissions || [], // Ensure permissions exist
        }
      });
    }

    // Seed teams
    console.log('Seeding teams...');
    for (const [id, team] of Object.entries(teams)) {
      const ref = db.collection('teams').doc(id);
      batch.set(ref, {
        ...team,
        memberIds: team.memberIds || [], // Ensure memberIds exist
        settings: {
          ...team.settings,
          permissions: team.settings.permissions || [], // Ensure permissions exist
        }
      });
    }

    // Seed roles
    console.log('Seeding roles...');
    for (const [id, role] of Object.entries(roles)) {
      const ref = db.collection('roles').doc(id);
      batch.set(ref, role);
    }

    // Seed permissions
    console.log('Seeding permissions...');
    for (const [id, permission] of Object.entries(permissions)) {
      const ref = db.collection('permissions').doc(id);
      batch.set(ref, permission);
    }

    // Seed features
    console.log('Seeding features...');
    for (const [id, feature] of Object.entries(features)) {
      const ref = db.collection('features').doc(id);
      batch.set(ref, feature);
    }

    // Commit the batch
    await batch.commit();

    // Create users in Firebase Auth and Firestore
    console.log('Seeding users...');
    for (const [id, user] of Object.entries(users)) {
      try {
        // Create user in Firebase Auth
        await auth.createUser({
          uid: user.uid, // Use uid instead of id
          email: user.email,
          password: 'password123', // Default password for testing
          displayName: `${user.firstName} ${user.lastName}`,
        });

        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({  // Use uid for document ID
          ...user,
          settings: {
            ...user.settings,
            notifications: user.settings.notifications || [], // Ensure notifications array exists
          },
          status: user.status || 'active', // Ensure status exists
        });

        console.log(`Created user: ${user.email}`);
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          console.log(`User ${user.email} already exists, updating...`);
          await db.collection('users').doc(user.uid).set({  // Use uid for document ID
            ...user,
            settings: {
              ...user.settings,
              notifications: user.settings.notifications || [],
            },
            status: user.status || 'active',
          });
        } else {
          console.error(`Error creating user ${user.email}:`, error);
        }
      }
    }

    console.log('Seed completed successfully!');
    console.log('\nTest account credentials:');
    console.log('Super Admin:', { email: 'admin@mitheia.com', password: 'password123' });
    console.log('Org Owner:', { email: 'owner@test.com', password: 'password123' });
    console.log('Team Manager:', { email: 'manager@test.com', password: 'password123' });
    console.log('Regular User:', { email: 'user@test.com', password: 'password123' });
    console.log('Small Org Owner:', { email: 'owner@small.com', password: 'password123' });

  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

// Run the seed function
seedData().then(() => process.exit(0));
