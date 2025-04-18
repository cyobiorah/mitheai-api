import { MongoClient, Db, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

export class MongoDBConnection {
  private static instance: MongoDBConnection;
  private readonly client: MongoClient;
  private db: Db | null = null;
  private connectionPromise: Promise<Db> | null = null;

  private constructor() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MongoDB URI is not defined in environment variables");
    }
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,
      minPoolSize: 5,
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
    if (this.db) return this.db;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.client
      .connect()
      .then(() => {
        this.db = this.client.db("mitheai");
        console.log("✅ Connected to MongoDB");
        return this.db;
      })
      .catch((error) => {
        this.connectionPromise = null;
        console.error("Failed to connect to MongoDB:", error);
        throw error;
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

  public async ping(): Promise<void> {
    try {
      const db = await this.connect();
      await db.command({ ping: 1 });
      console.log("Pinged MongoDB successfully");
    } catch (error) {
      console.error("MongoDB ping failed:", error);
    }
  }
}

// Helper to get the database instance
export async function getDb(): Promise<Db> {
  const connection = MongoDBConnection.getInstance();
  return connection.connect();
}

// Helper to get all main collections
export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection("users"),
    organizations: db.collection("organizations"),
    teams: db.collection("teams"),
    invitations: db.collection("invitations"),
    socialAccounts: db.collection("socialaccounts"),
    socialPosts: db.collection("socialposts"),
    contents: db.collection("contents"),
  };
}
