import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// MongoDB connection singleton
export class MongoDBConnection {
  private static instance: MongoDBConnection;
  private readonly client: MongoClient;
  private db: Db | null = null;

  private constructor() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MongoDB URI is not defined in environment variables");
    }
    this.client = new MongoClient(uri);
  }

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  public async connect(): Promise<Db> {
    if (!this.db) {
      await this.client.connect();
      this.db = this.client.db("mitheai");
    }
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.db = null;
      console.log("MongoDB connection closed");
    }
  }
}

// Export a function to get the database instance
export async function getDb(): Promise<Db> {
  const connection = MongoDBConnection.getInstance();
  return connection.connect();
}

// Collection references (similar to Firebase structure)
export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection("users"),
    organizations: db.collection("organizations"),
    teams: db.collection("teams"),
    invitations: db.collection("invitations"),
    socialAccounts: db.collection("socialAccounts"),
    // Add other collections as needed
  };
}
