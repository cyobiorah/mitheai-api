/**
 * MongoDB Reseed Script
 *
 * This script drops existing MongoDB collections and reseeds them with fresh data
 * It ensures proper password hashing and data structure for authentication
 */

import { MongoClient, Db, ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

// Load environment variables
dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/mitheai";
const DB_NAME = "mitheai";

// Sample data for seeding
const sampleData = {
  users: [
    {
      email: "admin@mitheai.com",
      firstName: "Admin",
      lastName: "User",
      password: "password123", // Will be hashed
      role: "super_admin",
      status: "active",
      uid: uuidv4(),
      teamIds: [], // Will be populated after teams are created
      organizationId: "", // Will be populated after organizations are created
      settings: {
        permissions: ["admin", "content_management"],
        theme: "light",
        notifications: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      email: "user@mitheai.com",
      firstName: "Regular",
      lastName: "User",
      password: "password123", // Will be hashed
      role: "user",
      status: "active",
      uid: uuidv4(),
      settings: {
        permissions: ["content_management"],
        theme: "light",
        notifications: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  organizations: [
    {
      name: "MitheAI Organization",
      type: "startup",
      settings: {
        permissions: [],
        maxTeams: 5,
        maxUsers: 10,
        features: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  teams: [
    {
      name: "Default Team",
      settings: {
        permissions: [],
      },
      memberIds: [], // Will be populated after users are created
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

async function reseedMongoDB() {
  console.log("Starting MongoDB reseed process...");

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(DB_NAME);

    // Drop existing collections
    const collections = [
      "users",
      "organizations",
      "teams",
      "socialAccounts",
      "invitations",
    ];
    for (const collection of collections) {
      try {
        await db.collection(collection).drop();
        console.log(`Dropped collection: ${collection}`);
      } catch (error) {
        console.log(
          `Collection ${collection} does not exist or could not be dropped`
        );
      }
    }

    // Create organization
    const organization = sampleData.organizations[0];
    const orgResult = await db
      .collection("organizations")
      .insertOne(organization);
    const organizationId = orgResult.insertedId;
    console.log(`Created organization with ID: ${organizationId}`);

    // Create team with organization reference
    const team = {
      ...sampleData.teams[0],
      organizationId,
      memberIds: [],
    };
    const teamResult = await db.collection("teams").insertOne(team);
    const teamId = teamResult.insertedId;
    console.log(`Created team with ID: ${teamId}`);

    // Create users with hashed passwords
    const userPromises = sampleData.users.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, 10);

      // Add organization and team references
      const userWithRefs: any = {
        ...user,
        password: hashedPassword,
      };

      // Only add organization and team references for organization users
      if (
        user.role === "super_admin" ||
        user.role === "org_owner" ||
        user.role === "team_manager"
      ) {
        userWithRefs.organizationId = organizationId.toString();
        userWithRefs.teamIds = [teamId.toString()];
      } else {
        // For regular users, ensure these fields are properly initialized
        userWithRefs.teamIds = [];
        userWithRefs.organizationId = null;
      }

      const result = await db.collection("users").insertOne(userWithRefs);
      const userId = result.insertedId;
      console.log(`Created user: ${user.email} with ID: ${userId}`);

      // Get current team to access existing memberIds
      const currentTeam = await db.collection("teams").findOne({ _id: teamId });
      const currentMemberIds = currentTeam?.memberIds || [];

      // Add the new userId to the array
      const updatedMemberIds = [...currentMemberIds, userId.toString()];

      // Add user to team members
      await db
        .collection("teams")
        .updateOne({ _id: teamId }, { $set: { memberIds: updatedMemberIds } });

      return userId;
    });

    await Promise.all(userPromises);

    console.log("MongoDB reseed completed successfully!");
    console.log("\nUser credentials for testing:");
    console.log("Admin: admin@mitheai.com / password123");
    console.log("User: user@mitheai.com / password123");
  } catch (error) {
    console.error("Error during MongoDB reseed:", error);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Run the reseed function
reseedMongoDB().catch(console.error);
