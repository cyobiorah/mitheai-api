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
    // socialAccounts,
    contents,
    socialposts,
    scheduledposts,
    invitations,
    sessions,
    socialaccounts,
  } = await getCollections();

  // Clear existing data
  await Promise.all([
    users.deleteMany({}),
    organizations.deleteMany({}),
    teams.deleteMany({}),
    // socialAccounts.deleteMany({}),
    contents.deleteMany({}),
    socialposts.deleteMany({}),
    scheduledposts.deleteMany({}),
    invitations.deleteMany({}),
    sessions.deleteMany({}),
    socialaccounts.deleteMany({}),
  ]);
  console.log("🧹 Cleared existing data");

  // Common password for all users
  const password = await bcrypt.hash("Password@12", 10);

  // Seed admin user
  const adminUserId = new ObjectId();
  const orgOwnerId = new ObjectId();
  const individualUserId = new ObjectId();

  await users.insertMany([
    {
      _id: adminUserId,
      email: "admin@mitheai.com",
      password,
      firstName: "Admin",
      lastName: "User",
      role: "super_admin",
      status: "active",
      userType: "organization",
    },
    {
      _id: orgOwnerId,
      email: "owner@mitheai.com",
      password,
      firstName: "Org",
      lastName: "Owner",
      role: "org_owner",
      status: "active",
      userType: "organization",
    },
    {
      _id: individualUserId,
      email: "individual@mitheai.com",
      password,
      firstName: "Indi",
      lastName: "Vidual",
      role: "user",
      status: "active",
      userType: "individual",
    },
  ]);

  // Seed organization
  const orgId = new ObjectId();
  await organizations.insertOne({
    _id: orgId,
    name: "TestOrg",
    ownerId: orgOwnerId,
    memberIds: [orgOwnerId, adminUserId],
  });

  // Seed team
  const teamId = new ObjectId();
  await teams.insertOne({
    _id: teamId,
    name: "TestTeam",
    organizationId: orgId,
    memberIds: [orgOwnerId, adminUserId],
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
      title: "Welcome to MitheAI",
      body: "This is a sample content item.",
      status: "draft",
    },
    {
      userId: individualUserId,
      title: "Individual's First Content",
      body: "This is content created by an individual user.",
      status: "draft",
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
    },
  ]);

  // Seed social post
  await socialposts.insertOne({
    userId: orgOwnerId,
    organizationId: orgId,
    teamId: teamId,
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
  });

  console.log("🌱 Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
