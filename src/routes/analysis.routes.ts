import express from "express";
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTeamTemplates,
  applyTemplate,
  getPersonalTemplates,
} from "../controllers/analysis.controller";
import { authenticateToken, requireTeamAccess } from '../middleware/auth.middleware';

const router = express.Router();

// Analysis Template Routes
router.post('/templates', authenticateToken, (req, res) => {
  return createTemplate(req, res);
});
router.get('/templates/:templateId', authenticateToken, (req, res) => {
  return getTemplate(req, res);
});
router.put('/templates/:templateId', authenticateToken, (req, res) => {
  return updateTemplate(req, res);
});
router.delete('/templates/:templateId', authenticateToken, (req, res) => {
  return deleteTemplate(req, res);
});
router.get('/templates/team/:teamId', authenticateToken, requireTeamAccess, (req, res) => {
  return listTeamTemplates(req, res);
});
router.post('/templates/:templateId/apply/:contentId', authenticateToken, (req, res) => {
  return applyTemplate(req, res);
});

// Personal routes
router.get("/personal/templates", authenticateToken, (req, res) => {
  return getPersonalTemplates(req, res);
});

export default router;
