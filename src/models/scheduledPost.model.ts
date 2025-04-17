import mongoose, { Schema, Document } from "mongoose";

export interface IScheduledPost extends Document {
  userId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  content: string;
  mediaUrls?: string[];
  scheduledFor: Date;
  timezone: string;
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
  errorMessage?: string;
  platforms: {
    platformId: string;
    accountId: string;
    status: "pending" | "published" | "failed";
    publishedAt?: Date;
    errorMessage?: string;
  }[];
  scheduledPostId?: mongoose.Types.ObjectId;
  mediaType: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledPostSchema = new Schema<IScheduledPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    content: { type: String, required: true },
    mediaUrls: [{ type: String }],
    scheduledFor: { type: Date, required: true },
    timezone: { type: String, required: true },
    status: {
      type: String,
      enum: ["scheduled", "processing", "completed", "failed", "cancelled"],
      required: true,
    },
    errorMessage: { type: String },
    platforms: [
      {
        platformId: { type: String, required: true },
        accountId: { type: String, required: true },
        status: {
          type: String,
          enum: ["pending", "published", "failed"],
          required: true,
        },
        publishedAt: { type: Date },
        errorMessage: { type: String },
      },
    ],
    scheduledPostId: { type: Schema.Types.ObjectId, ref: "ScheduledPost" },
    mediaType: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IScheduledPost>(
  "ScheduledPost",
  ScheduledPostSchema
);
