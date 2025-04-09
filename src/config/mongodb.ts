import { MongoClient, Db, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// MongoDB connection singleton
export class MongoDBConnection {
  private static instance: MongoDBConnection;
  private readonly client: MongoClient;
  private db: Db | null = null;
  private connectionPromise: Promise<Db> | null = null;

  private constructor() {
    const uri =
      process.env.NODE_ENV === "staging"
        ? process.env.MONGODB_URI_STAGING
        : process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MongoDB URI is not defined in environment variables");
    }

    // Create MongoDB client with improved options
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 30000, // 30 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds timeout
      maxPoolSize: 50, // Maintain up to 50 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      retryWrites: true,
      retryReads: true,
    });
  }

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  public async connect(): Promise<Db> {
    if (this.db) {
      return this.db;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        console.log("Connecting to MongoDB...");
        await this.client.connect();
        this.db = this.client.db("mitheai");
        console.log("Connected to MongoDB successfully");
        resolve(this.db);
      } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.db = null;
      this.connectionPromise = null;
      console.log("MongoDB connection closed");
    }
  }
}

// Export a function to get the database instance
export async function getDb(): Promise<Db> {
  const connection = MongoDBConnection.getInstance();
  return connection.connect();
}

export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection("users"),
    organizations: db.collection("organizations"),
    teams: db.collection("teams"),
    invitations: db.collection("invitations"),
    socialAccounts: db.collection("socialAccounts"),
    socialPosts: db.collection("socialPosts"),
  };
}
