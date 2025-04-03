import { Router } from 'express';
// import { createInvitation, acceptInvitation, verifyInvitation, resendInvitation } from '../controllers/invitations.controller';
import { createOrUpdateOrganization } from '../controllers/organizations.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Test route for development
// router.post('/test-invitation-email', (req, res, next) => {
//   console.log('Test route accessed');
//   console.log('NODE_ENV:', process.env.NODE_ENV);
//   console.log('Request path:', req.path);
//   console.log('Request body:', req.body);
  
//   if (process.env.NODE_ENV !== 'development') {
//     console.log('Not in development mode');
//     return res.status(404).json({ message: 'Not found' });
//   }
  
//   console.log('Test route hit - setting up mock user');
//   req.user = { uid: 'test-user-id', email: 'test@example.com' };
//   next();
// }, createInvitation);

// Organization routes
router.post('/organizations', createOrUpdateOrganization);

// Invitation routes
// router.post('/invitations', authenticateToken, createInvitation);
// router.get('/invitations/:token/verify', verifyInvitation);  
// router.post('/invitations/:token/accept', acceptInvitation);
// router.post('/invitations/resend', resendInvitation);

export default router;
