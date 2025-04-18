import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "1h";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables!");
}

export function signJwt(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
