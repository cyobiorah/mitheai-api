import mongoose, { Schema, Document } from "mongoose";

export interface ISocialPost extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  socialAccountId: mongoose.Types.ObjectId;
  content: string;
  mediaUrls?: string[];
  platforms: {
    platform: "twitter" | "facebook" | "linkedin" | "instagram" | "threads";
    accountId: string;
    status: "pending" | "published" | "failed";
    publishedAt?: Date;
    errorMessage?: string;
  }[];
  tags?: string[];
  scheduledFor?: Date;
  status: "draft" | "scheduled" | "published" | "failed";
  publishedAt: Date;
  publishResult?: any;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SocialPostSchema = new Schema<ISocialPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    content: { type: String, required: true },
    mediaUrls: [{ type: String }],
    platforms: [
      {
        platform: {
          type: String,
          enum: ["twitter", "facebook", "linkedin", "instagram", "threads"],
          required: true,
        },
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
    tags: [{ type: String }],
    scheduledFor: { type: Date },
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "failed"],
      required: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ISocialPost>("SocialPost", SocialPostSchema);
