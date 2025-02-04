import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

export const db = admin.firestore(app);
export const auth = admin.auth(app);

// Collection references
export const collections = {
  users: db.collection('users'),
  organizations: db.collection('organizations'),
  teams: db.collection('teams'),
  invitations: db.collection('invitations'),
} as const;
