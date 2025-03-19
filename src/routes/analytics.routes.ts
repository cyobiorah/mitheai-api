import express from "express";
import { AnalyticsController } from "../controllers/analytics.controller";
import { authenticateToken } from "../middleware/auth.middleware";

const router = express.Router();
const controller = new AnalyticsController();

// Get content analytics summary
router.get("/content", authenticateToken, (req, res) => {
  return controller.getContentAnalytics(req, res);
});

// Get platform-specific analytics
router.get("/platform/:platform", authenticateToken, (req, res) => {
  return controller.getPlatformAnalytics(req, res);
});

// Export analytics data
router.get("/export", authenticateToken, (req, res) => {
  return controller.exportAnalytics(req, res);
});

export default router;