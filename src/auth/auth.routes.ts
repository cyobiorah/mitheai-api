import { Router } from 'express';
import { login, register, me } from './auth.controller';
import { authenticateToken } from './auth.middleware';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.get('/me', authenticateToken, me);

export default router;
