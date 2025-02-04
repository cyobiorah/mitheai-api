import { Request, Response } from 'express';
import { LoginRequest, RegisterRequest } from '../types/auth';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db, auth, collections } from '../config/firebase';

// TODO: Replace with database
const users: any[] = [];
const organizations: any[] = [];

export const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user in Firestore
    const userSnapshot = await collections.users
      .where('email', '==', email)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    // Verify password
    const isValidPassword = await bcrypt.compare(password, userData.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Create Firebase custom token
    const customToken = await auth.createCustomToken(userDoc.id);

    // Generate JWT token
    const token = jwt.sign(
      { userId: userDoc.id, email: userData.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userData;

    res.json({
      token,
      firebaseToken: customToken,
      user: {
        id: userDoc.id,
        ...userWithoutPassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { firstName, lastName, email, password, organizationName } = req.body;

    // Check if user already exists
    const existingUser = await collections.users
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existingUser.empty) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create organization in Firestore
    const organizationRef = collections.organizations.doc();
    const organizationData = {
      name: organizationName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create user in Firestore
    const userRef = collections.users.doc();
    const userData = {
      email,
      firstName,
      lastName,
      password: hashedPassword,
      organizationId: organizationRef.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create default team
    const teamRef = collections.teams.doc();
    const teamData = {
      name: 'Default Team',
      organizationId: organizationRef.id,
      createdBy: userRef.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [{
        userId: userRef.id,
        role: 'owner',
        joinedAt: new Date().toISOString()
      }],
      settings: {
        isDefault: true,
        canDelete: false
      }
    };

    // Create Firebase Auth user
    const firebaseUser = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // Batch write to Firestore
    const batch = db.batch();
    batch.set(organizationRef, {
      ...organizationData,
      ownerId: userRef.id,
    });
    batch.set(userRef, userData);
    batch.set(teamRef, teamData);
    await batch.commit();

    // Create Firebase custom token
    const customToken = await auth.createCustomToken(userRef.id);

    // Generate JWT token
    const token = jwt.sign(
      { userId: userRef.id, email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userData;

    res.status(201).json({
      token,
      firebaseToken: customToken,
      user: {
        id: userRef.id,
        ...userWithoutPassword,
      },
      organization: organizationData,
      team: teamData,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Get user from Firestore
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(401).json({ message: 'User not found' });
    }

    const userData = userDoc.data()!;

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userData;

    res.json({
      id: userDoc.id,
      ...userWithoutPassword,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
