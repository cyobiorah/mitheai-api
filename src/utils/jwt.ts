import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "your_super_secret_key";
const JWT_EXPIRES_IN = "1h"; // or as needed

export function signJwt(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string) {
  return jwt.verify(token, JWT_SECRET);
}
