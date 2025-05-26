import { getCollections } from "../config/db";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

dotenv.config();

async function seed() {
  // Get all collections
  const {
    users,
    organizations,
    teams,
    contents,
    socialposts,
    scheduledposts,
    invitations,
    sessions,
    socialaccounts,
    collections,
    invoices,
  } = await getCollections();

  // Clear existing data
  await Promise.all([
    users.deleteMany({}),
    organizations.deleteMany({}),
    teams.deleteMany({}),
    contents.deleteMany({}),
    socialposts.deleteMany({}),
    scheduledposts.deleteMany({}),
    invitations.deleteMany({}),
    sessions.deleteMany({}),
    socialaccounts.deleteMany({}),
    collections.deleteMany({}),
    invoices.deleteMany({}),
  ]);
  console.log("🧹 Cleared existing data");

  // Common password for all users
  const password = await bcrypt.hash("Password@12", 10);

  // Seed admin user
  const adminUserId = new ObjectId();
  const orgOwnerId = new ObjectId();
  const individualUserId = new ObjectId();
  const date = new Date();

  await users.insertMany([
    {
      _id: adminUserId,
      email: "admin@skedlii.xyz",
      password,
      firstName: "Admin",
      lastName: "User",
      role: "super_admin",
      status: "active",
      userType: "organization",
      createdAt: date,
      updatedAt: date,
    },
    {
      _id: orgOwnerId,
      email: "owner@skedlii.xyz",
      password,
      firstName: "Org",
      lastName: "Owner",
      role: "org_owner",
      status: "active",
      userType: "organization",
      createdAt: date,
      updatedAt: date,
    },
    {
      _id: individualUserId,
      email: "individual@skedlii.xyz",
      password,
      firstName: "Indi",
      lastName: "Vidual",
      role: "user",
      status: "active",
      userType: "individual",
      createdAt: date,
      updatedAt: date,
    },
  ]);

  // Seed organization
  const orgId = new ObjectId();
  await organizations.insertOne({
    _id: orgId,
    name: "TestOrg",
    ownerId: orgOwnerId,
    memberIds: [orgOwnerId, adminUserId],
    createdAt: date,
    updatedAt: date,
  });

  // Seed team
  const teamId = new ObjectId();
  await teams.insertOne({
    _id: teamId,
    name: "TestTeam",
    organizationId: orgId,
    memberIds: [orgOwnerId, adminUserId],
    createdAt: date,
    updatedAt: date,
  });

  // Update users with org/team references
  await users.updateMany(
    { _id: { $in: [orgOwnerId, adminUserId] } },
    { $set: { organizationId: orgId, teamIds: [teamId] } }
  );

  // Seed content
  await contents.insertMany([
    {
      userId: orgOwnerId,
      organizationId: orgId,
      teamId: teamId,
      title: "Welcome to Skedlii",
      body: "This is a sample content item.",
      status: "draft",
      createdAt: date,
      updatedAt: date,
    },
    {
      userId: individualUserId,
      title: "Individual's First Content",
      body: "This is content created by an individual user.",
      status: "draft",
      createdAt: date,
      updatedAt: date,
    },
  ]);

  // Seed social accounts
  await socialaccounts.insertMany([
    {
      userId: orgOwnerId,
      organizationId: orgId,
      teamId: teamId,
      platform: "twitter",
      platformAccountId: "123456789",
      accountType: "personal",
      accountName: "Test Twitter",
      accountId: "test-twitter-id",
      accessToken: "fake-access-token",
      lastRefreshed: new Date(),
      status: "active",
      ownershipLevel: "user",
      createdAt: date,
      updatedAt: date,
    },
    {
      userId: individualUserId,
      platform: "twitter",
      platformAccountId: "indiv-twitter-123",
      accountType: "personal",
      accountName: "Indi Twitter",
      accountId: "indiv-twitter-id",
      accessToken: "fake-access-token",
      lastRefreshed: new Date(),
      status: "active",
      ownershipLevel: "user",
      createdAt: date,
      updatedAt: date,
    },
  ]);

  // Seed social post
  await socialposts.insertOne({
    userId: orgOwnerId,
    organizationId: orgId,
    teamId: teamId,
    content: "Hello world! #skedlii",
    platforms: [
      {
        platform: "twitter",
        accountId: "test-twitter-id",
        status: "pending",
      },
    ],
    status: "draft",
    createdAt: date,
    updatedAt: date,
  });

  // Seed scheduled post
  await scheduledposts.insertOne({
    userId: orgOwnerId,
    organizationId: orgId,
    teamId: teamId,
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
    createdAt: date,
    updatedAt: date,
  });

  console.log("🌱 Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
