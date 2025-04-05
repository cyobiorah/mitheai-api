import express from "express";
import {
  verifyInvitation,
  acceptInvitation,
  createInvitation,
} from "./invitations.controller";

const router = express.Router();

// Debug middleware for this router
router.use((req, res, next) => {
  // console.log('[DEBUG] Invitations Router:', req.method, req.url);
  next();
});

// Create invitation
router.post("/", createInvitation);

// Verify invitation
router.get("/:token/verify", verifyInvitation);

// Accept invitation
router.post("/:token/accept", acceptInvitation);

// Debug: Print routes
// console.log('[DEBUG] Invitation routes:');
// router.stack.forEach((r: any) => {
//   if (r.route && r.route.path) {
//     console.log(`[DEBUG] ${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
//   }
// });

export default router;
