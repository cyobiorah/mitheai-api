import express from 'express';
import {
  getUsers,
  inviteUser,
  updateUser,
  deleteUser,
} from '../controllers/users.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(authenticateToken);

// User management routes
router.get('/organization/:organizationId', getUsers);
router.post('/invite', inviteUser);
router.put('/:userId', updateUser);
router.delete('/:userId', deleteUser);

export default router;
