import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

export const getUserById = async (userId: string) => {
  const { users } = await getCollections();
  // Exclude password from the result
  return users.findOne(
    { _id: new ObjectId(userId) },
    { projection: { password: 0 } }
  );
};

// export const updateUserProfile = async (userId: string, update: any) => {
//   // Only allow certain fields to be updated
//   const allowedFields = ["firstName", "lastName", "avatar", "bio"];
//   const updateData: any = {};
//   for (const field of allowedFields) {
//     if (update[field] !== undefined) updateData[field] = update[field];
//   }
//   return User.findByIdAndUpdate(userId, updateData, {
//     new: true,
//     runValidators: true,
//   }).select("-password");
// };

// export const changeUserPassword = async (
//   userId: string,
//   currentPassword: string,
//   newPassword: string
// ) => {
//   const user = await User.findById(userId);
//   if (!user) throw new Error("User not found");

//   const match = await bcrypt.compare(currentPassword, user.password);
//   if (!match) throw new Error("Current password is incorrect");

//   user.password = await bcrypt.hash(newPassword, 10);
//   await user.save();
// };

export async function updateUserProfile(userId: string, update: any) {
  const { users } = await getCollections();
  await users.updateOne({ _id: new ObjectId(userId) }, { $set: update });
  return users.findOne({ _id: new ObjectId(userId) });
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const { users } = await getCollections();
  const user = await users.findOne({ _id: new ObjectId(userId) });
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await users.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { password: hashedPassword } }
  );
}

// Find a user by email
export const findUserByEmail = async (email: string) => {
  const { users } = await getCollections();
  return users.findOne({ email });
};

// Update a user by _id
export const updateUser = async (
  userId: string | ObjectId,
  updates: Record<string, any>
) => {
  const { users } = await getCollections();
  const _id = typeof userId === "string" ? new ObjectId(userId) : userId;
  await users.updateOne(
    { _id },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return users.findOne({ _id });
};

// Find users by organization ID
export const findUsersByOrganizationId = async (organizationId: string) => {
  const { users } = await getCollections();
  return users.find({ organizationId: new ObjectId(organizationId) }).toArray();
};
