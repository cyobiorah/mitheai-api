import { getCollections } from "../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/httpError";
import { ObjectId } from "mongodb";

// Register a new user
export const registerUser = async (userData: any) => {
  const { users } = await getCollections();

  const existing = await users.findOne({ email: userData.email });
  if (existing) throw new HttpError("Email already in use", 400);

  const hashed = await bcrypt.hash(userData.password, 10);
  const userDoc = {
    ...userData,
    password: hashed,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await users.insertOne(userDoc);
  return { _id: result.insertedId, ...userDoc };
};

// Authenticate user by email and password
export const authenticateUser = async (email: string, password: string) => {
  const { users } = await getCollections();
  const user = await users.findOne({ email });
  if (!user) throw new HttpError("Invalid credentials", 401);
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new HttpError("Invalid credentials", 401);
  return user;
};

// Generate a JWT token
export const generateJWT: (user: any) => string = (user: any) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      userType: user.userType,
      // Conditionally add organizationId if userType is organization
      ...(user.userType === "organization" && {
        organizationId: user.organizationId,
      }),
      // Conditionally add teamIds if userType is organization
      ...(user.userType === "organization" && { teamIds: user.teamIds }),
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
};

// Find user by email
export const findUserByEmail = async (email: string) => {
  const { users } = await getCollections();
  return users.findOne({ email });
};

// Find user by reset token
export const findUserByToken = async (token: string) => {
  const { users } = await getCollections();
  return users.findOne({ resetToken: token });
};

// Reset password
export const resetPassword = async (userId: string, password: string) => {
  const { users } = await getCollections();
  const hashed = await bcrypt.hash(password, 10);
  await users.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { password: hashed } }
  );
};

// Delete user
export const deleteUser = async (userId: string) => {
  const { users } = await getCollections();
  await users.deleteOne({ _id: new ObjectId(userId) });
};
