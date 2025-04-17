import User from "../models/user.model";
import bcrypt from "bcrypt";

export const getUserById = async (userId: string) => {
  return User.findById(userId).select("-password");
};

export const updateUserProfile = async (userId: string, update: any) => {
  // Only allow certain fields to be updated
  const allowedFields = ["firstName", "lastName", "avatar", "bio"];
  const updateData: any = {};
  for (const field of allowedFields) {
    if (update[field] !== undefined) updateData[field] = update[field];
  }
  return User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");
};

export const changeUserPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) throw new Error("Current password is incorrect");

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
};
