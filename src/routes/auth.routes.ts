import { Router } from "express";
import * as AuthController from "../controllers/auth.controller";
import { requireJwtAuth } from "../middlewares/auth";
import { handleValidationErrors, HttpError } from "../utils/httpError";
import { body } from "express-validator";

const router = Router();

router.post("/register", AuthController.register);
// router.post("/login", handleValidationErrors, AuthController.login);
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Email is invalid"),
    body("password").notEmpty().withMessage("Password is required"),
    handleValidationErrors,
  ],
  AuthController.login
);
// router.post(
//   "/login",
//   [
//     body("email").isEmail(),
//     body("password").notEmpty(),
//     handleValidationErrors,
//   ],
//   (req: any, res: any) => {
//     throw new HttpError("Intentional 403 test", 403);
//   }
// );
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.delete("/me", requireJwtAuth, AuthController.deleteOwnAccount);

export default router;
