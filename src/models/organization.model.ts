import mongoose, { Schema, Document } from "mongoose";

export interface IOrganization extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  defaultTeamId?: mongoose.Types.ObjectId;
  memberIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    defaultTeamId: { type: Schema.Types.ObjectId, ref: "Team" },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model<IOrganization>(
  "Organization",
  OrganizationSchema
);
