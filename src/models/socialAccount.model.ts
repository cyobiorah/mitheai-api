import mongoose, { Schema, Document } from "mongoose";

export interface ISocialAccount extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  platform: "twitter" | "facebook" | "linkedin" | "instagram" | "threads";
  platformAccountId: string;
  accountType: "personal" | "business";
  accountName: string;
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenExpiry?: Date | null;
  lastRefreshed: Date;
  status: "active" | "expired" | "revoked" | "error";
  metadata?: Record<string, any>;
  permissions?: Record<string, any>;
  welcomeTweetSent?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization" },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    platform: {
      type: String,
      enum: ["twitter", "facebook", "linkedin", "instagram", "threads"],
      required: true,
    },
    platformAccountId: { type: String, required: true },
    accountType: {
      type: String,
      enum: ["personal", "business"],
      required: true,
    },
    accountName: { type: String },
    accountId: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
    tokenExpiry: { type: Date },
    lastRefreshed: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["active", "expired", "revoked", "error"],
      required: true,
    },
    metadata: { type: Schema.Types.Mixed },
    idToken: { type: String },
    permissions: { type: Schema.Types.Mixed },
    welcomeTweetSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate linking
SocialAccountSchema.index(
  { platform: 1, platformAccountId: 1 },
  { unique: true }
);

// Optional: Add validation logic for accountType/org/team
SocialAccountSchema.pre("validate", function (next) {
  if (this.accountType === "personal") {
    this.organizationId = undefined;
    this.teamId = undefined;
  }
  if (this.accountType === "business" && !this.organizationId) {
    return next(new Error("organizationId is required for business accounts"));
  }
  next();
});

const SocialAccount = mongoose.model<ISocialAccount>(
  "SocialAccount",
  SocialAccountSchema
);

export default SocialAccount;
