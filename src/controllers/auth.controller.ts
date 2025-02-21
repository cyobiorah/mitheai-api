import { Request, Response } from 'express';
import { LoginRequest, RegisterRequest, IndividualRegisterRequest, OrganizationRegisterRequest } from '../types/auth';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { db, auth, collections } from '../config/firebase';

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

    // Get organization data if user is organization type
    let organizationData;
    if (userData.userType === 'organization' && userData.organizationId) {
      const orgDoc = await collections.organizations.doc(userData.organizationId).get();
      if (orgDoc.exists) {
        organizationData = orgDoc.data();
      }
    }

    res.json({
      token,
      firebaseToken: customToken,
      user: {
        id: userDoc.id,
        ...userWithoutPassword,
      },
      ...(organizationData && { organization: organizationData }),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { firstName, lastName, email, password, userType } = req.body;

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

    // Create user in Firestore
    const userRef = collections.users.doc();
    const baseUserData = {
      email,
      firstName,
      lastName,
      password: hashedPassword,
      userType,
      status: 'active',
      settings: {
        permissions: ['content_management'],
        theme: 'light',
        notifications: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let organizationRef, teamRef;
    let organizationData, teamData;

    // Handle organization-specific setup
    if (userType === 'organization') {
      const { organizationName } = req.body as OrganizationRegisterRequest;
      
      // Create organization
      organizationRef = collections.organizations.doc();
      organizationData = {
        name: organizationName,
        ownerId: userRef.id,
        type: 'business',
        settings: {
          permissions: ['content_management', 'team_management'],
          maxTeams: 10,
          maxUsers: 50,
          features: ['content_management', 'team_management', 'analytics']
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create default team
      teamRef = collections.teams.doc();
      teamData = {
        name: 'Default Team',
        description: 'Default team for organization',
        organizationId: organizationRef.id,
        memberIds: [userRef.id],
        settings: {
          permissions: ['content_write', 'team_read']
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Create Firebase Auth user
    const firebaseUser = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // Batch write to Firestore
    const batch = db.batch();
    
    if (userType === 'organization') {
      batch.set(organizationRef!, organizationData!);
      batch.set(teamRef!, teamData!);
      batch.set(userRef, {
        ...baseUserData,
        organizationId: organizationRef!.id,
        role: 'org_owner',
        teamIds: [teamRef!.id],
      });
    } else {
      // Individual user
      batch.set(userRef, {
        ...baseUserData,
        settings: {
          ...baseUserData.settings,
          personalPreferences: {
            defaultContentType: 'social_post',
            aiPreferences: {
              tone: 'professional',
              style: 'concise'
            }
          }
        }
      });
    }

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
    const { password: _, ...userWithoutPassword } = baseUserData;

    res.status(201).json({
      token,
      firebaseToken: customToken,
      user: {
        id: userRef.id,
        ...userWithoutPassword,
        ...(userType === 'organization' && {
          organizationId: organizationRef!.id,
          role: 'org_owner',
          teamIds: [teamRef!.id],
        }),
      },
      ...(organizationData && { organization: organizationData }),
      ...(teamData && { team: teamData }),
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

    // Get organization data if user is organization type
    let organizationData;
    if (userData.userType === 'organization' && userData.organizationId) {
      const orgDoc = await collections.organizations.doc(userData.organizationId).get();
      if (orgDoc.exists) {
        organizationData = orgDoc.data();
      }
    }

    res.json({
      id: userDoc.id,
      ...userWithoutPassword,
      ...(organizationData && { organization: organizationData }),
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
