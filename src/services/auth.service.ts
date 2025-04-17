import User, { IUser } from "../models/user.model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const registerUser = async (userData: Partial<IUser>) => {
  const existing = await User.findOne({ email: userData.email });
  if (existing) throw new Error("Email already in use");

  const hashed = await bcrypt.hash(userData.password!, 10);
  const user = new User({ ...userData, password: hashed });
  await user.save();
  return user;
};

export const authenticateUser = async (email: string, password: string) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid credentials");
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");
  return user;
};

export const generateJWT: (user: IUser) => string = (user: IUser) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      userType: user.userType,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
};
