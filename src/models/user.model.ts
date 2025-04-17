import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: "super_admin" | "org_owner" | "admin" | "user";
  status: "active" | "invited" | "inactive" | "pending";
  userType: "individual" | "organization";
  teamIds?: mongoose.Types.ObjectId[];
  organizationId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: {
      type: String,
      enum: ["super_admin", "org_owner", "admin", "user"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "invited", "inactive", "pending"],
      required: true,
    },
    userType: {
      type: String,
      enum: ["individual", "organization"],
      required: true,
    },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>("User", UserSchema);
