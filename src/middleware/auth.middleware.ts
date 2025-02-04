import { Request, Response, NextFunction } from 'express';
import { auth, collections } from '../config/firebase';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        teamIds?: string[];
        currentTeamId?: string;
        isNewUser?: boolean;  // Flag to indicate if user exists in Firestore
      };
    }
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log('[DEBUG] Auth middleware executing');
  try {
    // Debug logging
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('Request path:', req.path);
    console.log('Full URL:', req.originalUrl);

    // Skip authentication for test routes in development
    if (process.env.NODE_ENV === 'development' && (
      req.path === '/api/test-invitation-email' || 
      req.originalUrl === '/api/test-invitation-email'
    )) {
      console.log('[DEBUG] Bypassing auth for test route:', req.originalUrl);
      req.user = { 
        uid: 'test-user-id', 
        email: 'test@example.com',
        teamIds: ['test-team-id'],
        currentTeamId: 'test-team-id',
        isNewUser: false
      };
      return next();
    }

    const authHeader = req.headers['authorization'];
    console.log('[DEBUG] Auth header:', authHeader);
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log('[DEBUG] No token found in auth header');
      return res.status(401).json({ message: 'No token provided' });
    }

    console.log('[DEBUG] Verifying token');
    try {
      // Verify the Firebase ID token
      const decodedToken = await auth.verifyIdToken(token);
      console.log('[DEBUG] Token verified:', decodedToken);

      // Get user from Firestore
      const userDoc = await collections.users.doc(decodedToken.uid).get();
      const userData = userDoc.data();
      
      // Set basic user info from Firebase Auth
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        isNewUser: !userDoc.exists
      };

      // If user exists in Firestore, add team information
      if (userDoc.exists && userData) {
        req.user.teamIds = userData.teamIds || [];
        req.user.currentTeamId = userData.currentTeamId;
      } else {
        // For new users or during onboarding, set empty team arrays
        req.user.teamIds = [];
        req.user.currentTeamId = undefined;
      }

      console.log('[DEBUG] User authenticated:', req.user);
      next();
    } catch (error) {
      console.error('[DEBUG] Auth error:', error);
      res.status(403).json({ message: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Internal server error during authentication' });
  }
};
