import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "1h";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables!");
}

export function signJwt(payload: object) {
  console.log("JWT_SECRET at sign/verify:", JWT_SECRET);
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string) {
  console.log("JWT_SECRET at verify:", JWT_SECRET);
  return jwt.verify(token, JWT_SECRET);
}
