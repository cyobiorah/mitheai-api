import { Request, Response, NextFunction } from "express";
import { isValidObjectId } from "./objectId";

export function validateObjectId(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName];
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        error: `Invalid ID format for parameter: ${paramName}`,
      });
    }
    next();
  };
}
