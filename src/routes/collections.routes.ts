import express from "express";
import {
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
  listTeamCollections,
  addContentToCollection,
  removeContentFromCollection,
  getPersonalCollections,
} from "../controllers/collections.controller";
import { authenticateToken, requireTeamAccess } from '../middleware/auth.middleware';

const router = express.Router();

// Personal routes
router.get("/personal", authenticateToken, (req, res) => {
  return getPersonalCollections(req, res);
});

// Team routes
router.get("/team/:teamId", authenticateToken, requireTeamAccess, (req, res) => {
  return listTeamCollections(req, res);
});

// Standard CRUD routes
router.post("/", authenticateToken, (req, res) => {
  return createCollection(req, res);
});

router.get("/:collectionId", authenticateToken, (req, res) => {
  return getCollection(req, res);
});

router.put("/:collectionId", authenticateToken, (req, res) => {
  return updateCollection(req, res);
});

router.delete("/:collectionId", authenticateToken, (req, res) => {
  return deleteCollection(req, res);
});

// Collection content management
router.post("/:collectionId/content/:contentId", authenticateToken, (req, res) => {
  return addContentToCollection(req, res);
});

router.delete("/:collectionId/content/:contentId", authenticateToken, (req, res) => {
  return removeContentFromCollection(req, res);
});

export default router;
