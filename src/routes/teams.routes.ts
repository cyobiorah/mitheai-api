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
import { authenticateToken, requireOrgAccess, requireTeamAccess } from '../middleware/auth.middleware';

const router = express.Router();

// Team routes - all team routes require organization access
router.post('/', authenticateToken, requireOrgAccess, createTeam);
router.get('/organization/:organizationId', authenticateToken, requireOrgAccess, getTeams);
router.get('/:teamId', authenticateToken, requireTeamAccess, getTeam);
router.put('/:teamId', authenticateToken, requireTeamAccess, updateTeam);
router.delete('/:teamId', authenticateToken, requireTeamAccess, deleteTeam);

// Team member routes - require team access
router.post('/:teamId/members/:userId', authenticateToken, requireTeamAccess, addTeamMember);
router.delete('/:teamId/members/:userId', authenticateToken, requireTeamAccess, removeTeamMember);

export default router;
