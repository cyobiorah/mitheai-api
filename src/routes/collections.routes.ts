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

const router = Router();

// Collection Routes
router.post('/', createCollection);
router.get('/:collectionId', getCollection);
router.put('/:collectionId', updateCollection);
router.delete('/:collectionId', deleteCollection);
router.post('/:collectionId/content/:contentId', addContentToCollection);
router.delete('/:collectionId/content/:contentId', removeContentFromCollection);
router.get('/team/:teamId', listTeamCollections);

export default router;
