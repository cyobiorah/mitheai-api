import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export function requireJwtAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // console.log({ headers: req.headers });
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "No token provided",
      code: "NO_TOKEN",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Token has expired",
          code: "TOKEN_EXPIRED",
        });
      }

      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "Invalid token",
          code: "INVALID_TOKEN",
        });
      }

      // Any other JWT error
      return res.status(401).json({
        error: "Authentication failed",
        code: "AUTH_FAILED",
      });
    }
    (req as any).user = decoded;
    next();
  });
}
