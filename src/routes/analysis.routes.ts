import { Router } from 'express';
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTeamTemplates,
  applyTemplate
} from '../controllers/analysis.controller';

const router = Router();

// Analysis Template Routes
router.post('/templates', createTemplate);
router.get('/templates/:templateId', getTemplate);
router.put('/templates/:templateId', updateTemplate);
router.delete('/templates/:templateId', deleteTemplate);
router.get('/templates/team/:teamId', listTeamTemplates);
router.post('/templates/:templateId/apply/:contentId', applyTemplate);

export default router;
