import mongoose, { Schema, Document } from "mongoose";

export interface IContent extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  title: string;
  body: string;
  tags?: string[];
  status: "draft" | "scheduled" | "published" | "archived";
  scheduledFor?: Date;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: false },
    title: { type: String, required: true },
    body: { type: String, required: true },
    tags: [{ type: String }],
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "archived"],
      required: true,
    },
    scheduledFor: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IContent>("Content", ContentSchema);
