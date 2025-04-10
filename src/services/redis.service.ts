import { Redis } from "ioredis";
import { config } from "dotenv";

config(); // Load environment variables

// Default to a local Redis instance if no URL is provided
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

class RedisService {
  private client: Redis;
  private static instance: RedisService;

  private constructor() {
    this.client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
    });

    this.client.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    this.client.on("connect", () => {
      console.log("Connected to Redis");
    });
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Store data in Redis with an expiration time
   * @param key The key to store data under
   * @param data The data to store
   * @param expiryInSeconds Time in seconds until the data expires
   */
  async set(key: string, data: any, expiryInSeconds = 600): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(data), "EX", expiryInSeconds);
    } catch (error) {
      console.error("Redis set error:", error);
      throw error;
    }
  }

  /**
   * Retrieve data from Redis
   * @param key The key to retrieve data for
   * @returns The stored data or null if not found
   */
  async get(key: string): Promise<any> {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Redis get error:", error);
      throw error;
    }
  }

  /**
   * Delete data from Redis
   * @param key The key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
      throw error;
    }
  }

  /**
   * Check if a key exists in Redis
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error("Redis exists error:", error);
      throw error;
    }
  }
}

export default RedisService.getInstance();
