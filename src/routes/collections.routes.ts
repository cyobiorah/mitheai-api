import { Router } from 'express';
import {
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
  addContentToCollection,
  removeContentFromCollection,
  listTeamCollections
} from '../controllers/collections.controller';
import { authenticateToken, requireTeamAccess } from '../middleware/auth.middleware';

const router = Router();

// Collection Routes - all require authentication
router.post('/', authenticateToken, createCollection);
router.get('/:collectionId', authenticateToken, getCollection);
router.put('/:collectionId', authenticateToken, updateCollection);
router.delete('/:collectionId', authenticateToken, deleteCollection);
router.post('/:collectionId/content/:contentId', authenticateToken, addContentToCollection);
router.delete('/:collectionId/content/:contentId', authenticateToken, removeContentFromCollection);

// Team collections require team access
router.get('/team/:teamId', authenticateToken, requireTeamAccess, listTeamCollections);

export default router;
