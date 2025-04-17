import mongoose, { Schema, Document } from "mongoose";

export interface IInvitation extends Document {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: mongoose.Types.ObjectId;
  teamIds: mongoose.Types.ObjectId[];
  token: string;
  status: "pending" | "accepted" | "cancelled";
  expiresAt: Date;
  createdAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    email: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    role: { type: String, required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }],
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "cancelled"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IInvitation>("Invitation", InvitationSchema);
