import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

router.get("/me", requireJwtAuth, usersController.getMe);
router.patch("/me", requireJwtAuth, usersController.updateMe);
router.post("/change-password", requireJwtAuth, usersController.changePassword);

export default router;
