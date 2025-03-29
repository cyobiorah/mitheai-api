import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const app = admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  } as admin.ServiceAccount),
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
  socialAccounts: db.collection('social_accounts'),
} as const;
