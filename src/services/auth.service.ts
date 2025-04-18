import { getCollections } from "../config/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Register a new user
export const registerUser = async (userData: any) => {
  const { users } = await getCollections();

  const existing = await users.findOne({ email: userData.email });
  if (existing) throw new Error("Email already in use");

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
  if (!user) throw new Error("Invalid credentials");
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");
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
