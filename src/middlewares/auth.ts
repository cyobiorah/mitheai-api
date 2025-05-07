import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export function requireJwtAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Attach user/org info to request for downstream handlers
    (req as any).user = decoded;
    next();
  } catch (err) {
    console.log("Invalid or expired token", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
