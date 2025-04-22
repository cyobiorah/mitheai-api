import { Router } from "express";
import * as invitationsController from "../controllers/invitations.controller";

const router = Router();

router.post("/", invitationsController.createInvitation);
router.get("/:token/verify", invitationsController.verifyInvitation);
router.post("/:token/accept", invitationsController.acceptInvitation);
router.post("/resend", invitationsController.resendInvitation);

export default router;
