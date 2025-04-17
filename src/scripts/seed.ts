import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

// Import your models
import User from "../models/user.model";
import Organization from "../models/organization.model";
import Team from "../models/team.model";
import SocialAccount from "../models/socialAccount.model";
import Content from "../models/content.model";
import SocialPost from "../models/socialPost.model";
import ScheduledPost from "../models/scheduledPost.model";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/mitheai";

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Team.deleteMany({}),
    SocialAccount.deleteMany({}),
    Content.deleteMany({}),
    SocialPost.deleteMany({}),
    ScheduledPost.deleteMany({}),

    mongoose.connection.collection("sessions").deleteMany({}),
    mongoose.connection.collection("invitations").deleteMany({}),
    mongoose.connection.collection("socialaccounts").deleteMany({}),
  ]);
  console.log("🧹 Cleared existing data");

  // Common password for all users
  const password = await bcrypt.hash("Password@12", 10);

  // Seed admin user (super_admin, not tied to org/team)
  const adminUser = await User.create({
    email: "admin@mitheai.com",
    password,
    firstName: "Admin",
    lastName: "User",
    role: "super_admin",
    status: "active",
    userType: "organization", // <-- corrected
  });

  // Seed org owner (org user)
  const orgOwner = await User.create({
    email: "owner@mitheai.com",
    password,
    firstName: "Org",
    lastName: "Owner",
    role: "org_owner",
    status: "active",
    userType: "organization", // <-- corrected
  });

  // Seed individual user (not part of org/team)
  const individualUser = await User.create({
    email: "individual@mitheai.com",
    password,
    firstName: "Indi",
    lastName: "Vidual",
    role: "user",
    status: "active",
    userType: "individual", // <-- correct
  });

  // Seed organization
  const org = await Organization.create({
    name: "TestOrg",
    ownerId: orgOwner._id,
    memberIds: [orgOwner._id, adminUser._id],
  });

  // Seed team under organization
  const team = await Team.create({
    name: "TestTeam",
    organizationId: org._id,
    memberIds: [orgOwner._id, adminUser._id],
  });

  // Update users with org/team references
  await User.updateMany(
    { _id: { $in: [orgOwner._id, adminUser._id] } },
    { $set: { organizationId: org._id, teamIds: [team._id] } }
  );

  // Seed content for org owner
  await Content.create({
    userId: orgOwner._id,
    organizationId: org._id,
    teamId: team._id,
    title: "Welcome to MitheAI",
    body: "This is a sample content item.",
    status: "draft",
  });

  // Seed content for individual user (not part of org/team)
  await Content.create({
    userId: individualUser._id,
    title: "Individual's First Content",
    body: "This is content created by an individual user.",
    status: "draft",
  });

  // Seed social account for org owner
  await SocialAccount.create({
    userId: orgOwner._id,
    organizationId: org._id,
    teamId: team._id,
    platform: "twitter",
    platformAccountId: "123456789",
    accountType: "personal",
    accountName: "Test Twitter",
    accountId: "test-twitter-id",
    accessToken: "fake-access-token",
    lastRefreshed: new Date(),
    status: "active",
    ownershipLevel: "user",
  });

  // Seed social account for individual user
  await SocialAccount.create({
    userId: individualUser._id,
    platform: "twitter",
    platformAccountId: "indiv-twitter-123",
    accountType: "personal",
    accountName: "Indi Twitter",
    accountId: "indiv-twitter-id",
    accessToken: "fake-access-token",
    lastRefreshed: new Date(),
    status: "active",
    ownershipLevel: "user",
  });

  // Seed social post for org owner
  await SocialPost.create({
    userId: orgOwner._id,
    organizationId: org._id,
    teamId: team._id,
    content: "Hello world! #mitheai",
    platforms: [
      {
        platform: "twitter",
        accountId: "test-twitter-id",
        status: "pending",
      },
    ],
    status: "draft",
  });

  // Seed scheduled post for org owner
  await ScheduledPost.create({
    userId: orgOwner._id,
    organizationId: org._id,
    teamId: team._id,
    content: "Scheduled post content",
    scheduledFor: new Date(Date.now() + 3600 * 1000),
    timezone: "UTC",
    status: "scheduled",
    mediaType: "text",
    platforms: [
      {
        platformId: "twitter",
        accountId: "test-twitter-id",
        status: "pending",
      },
    ],
  });

  console.log("🌱 Seeding complete!");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
