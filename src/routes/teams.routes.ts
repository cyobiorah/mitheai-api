import express from 'express';
import {
  createTeam,
  getTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from '../controllers/teams.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// Team routes
router.post('/', authenticateToken, createTeam);
router.get('/organization/:organizationId', authenticateToken, getTeams);
router.get('/:teamId', authenticateToken, getTeam);
router.put('/:teamId', authenticateToken, updateTeam);
router.delete('/:teamId', authenticateToken, deleteTeam);

// Team member routes
router.post('/:teamId/members/:userId', authenticateToken, addTeamMember);
router.delete('/:teamId/members/:userId', authenticateToken, removeTeamMember);

export default router;
