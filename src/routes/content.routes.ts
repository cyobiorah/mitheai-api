import express from "express";
import {
  createContent,
  getContent,
  updateContent,
  deleteContent,
  analyzeContent,
  listTeamContent,
  archiveContent,
  generateContent,
} from "../controllers/content.controller";
import { authenticateToken, requireTeamAccess } from '../middleware/auth.middleware';

// Create router instance
const router = express.Router();

// Immediately log that this module is being loaded
// console.log('[DEBUG] Content routes module is being loaded');
// console.log('[DEBUG] Router instance created');

// Router-level middleware for debugging
router.use((req, res, next) => {
  // console.log('\n[DEBUG] Content router middleware hit');
  // console.log('[DEBUG] Request details:');
  // console.log('- Method:', req.method);
  // console.log('- Full URL:', req.originalUrl);
  // console.log('- Base URL:', req.baseUrl);
  // console.log('- Path:', req.path);
  // console.log('- Headers:', req.headers);
  // console.log('- Body:', JSON.stringify(req.body, null, 2));
  next();
});

// Test route
router.get("/test", (req, res) => {
  // console.log("[DEBUG] Test route hit");
  res.json({ message: "Content router is working" });
});

// AI Content Generation route
router.post("/generate", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Generate route hit in content router");
  // console.log("[DEBUG] Request body:", JSON.stringify(req.body, null, 2));
  // console.log("[DEBUG] Request path:", req.path);
  // console.log("[DEBUG] Request baseUrl:", req.baseUrl);
  // console.log("[DEBUG] Request originalUrl:", req.originalUrl);
  return generateContent(req, res);
});

// Team routes
router.get("/team/:teamId", authenticateToken, requireTeamAccess, (req, res) => {
  // console.log("[DEBUG] Team content route hit");
  // console.log("[DEBUG] Team ID:", req.params.teamId);
  return listTeamContent(req, res);
});

// Content Item Routes
router.post("/", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Create content route hit");
  return createContent(req, res);
});

router.get("/:contentId", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Get content route hit");
  // console.log("[DEBUG] Content ID:", req.params.contentId);
  return getContent(req, res);
});

router.put("/:contentId", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Update content route hit");
  // console.log("[DEBUG] Content ID:", req.params.contentId);
  return updateContent(req, res);
});

router.delete("/:contentId", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Delete content route hit");
  // console.log("[DEBUG] Content ID:", req.params.contentId);
  return deleteContent(req, res);
});

router.post("/:contentId/analyze", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Analyze content route hit");
  // console.log("[DEBUG] Content ID:", req.params.contentId);
  return analyzeContent(req, res);
});

router.post("/:contentId/archive", authenticateToken, (req, res) => {
  // console.log("[DEBUG] Archive content route hit");
  // console.log("[DEBUG] Content ID:", req.params.contentId);
  return archiveContent(req, res);
});

// Log all registered routes
// console.log("\n[DEBUG] Content Routes registered:");
// router.stack.forEach((r: any) => {
//   if (r.route && r.route.path) {
//     console.log(
//       `[DEBUG] Route: ${Object.keys(r.route.methods).join(",")} ${r.route.path}`
//     );
//   }
// });

// Log router details without trying to stringify the entire object
// console.log("[DEBUG] Content router stack details:");
// router.stack.forEach((layer: any, index: number) => {
//   console.log(`[DEBUG] Layer ${index}:`, {
//     name: layer.name,
//     path: layer.route?.path,
//     methods: layer.route?.methods
//       ? Object.keys(layer.route.methods)
//       : undefined,
//   });
// });

export default router;
