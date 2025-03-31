import { RepositoryFactory } from "../repositories/repository.factory";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../app-types";

export class UserService {
  private userRepository: any;
  private static instance: UserService | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.userRepository = await RepositoryFactory.createUserRepository();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize UserService:", error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        this.initPromise = this.initialize();
        await this.initPromise;
      }
    }
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  // For backward compatibility
  public static async create(): Promise<UserService> {
    return UserService.getInstance();
  }

  async findById(id: string): Promise<User | null> {
    await this.ensureInitialized();
    
    // Try to find by uid first, since that's what we store in JWT
    const userByUid = await this.userRepository.findOne({ uid: id });
    if (userByUid) {
      return userByUid;
    }
    
    // Fall back to MongoDB ObjectId lookup if uid not found
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      // If ObjectId conversion fails, return null
      console.error("Error finding user by ID:", error);
      return null;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    await this.ensureInitialized();
    return await this.userRepository.findByEmail(email);
  }

  async findOne(query: any): Promise<User | null> {
    await this.ensureInitialized();
    return await this.userRepository.findOne(query);
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    await this.ensureInitialized();
    return await this.userRepository.findByOrganization(organizationId);
  }

  async findByTeam(teamId: string): Promise<User[]> {
    await this.ensureInitialized();
    return await this.userRepository.findByTeam(teamId);
  }

  async create(
    userData: Omit<User, "uid" | "createdAt" | "updatedAt">
  ): Promise<User> {
    await this.ensureInitialized();
    
    // Let MongoDB generate the _id automatically
    const newUser = await this.userRepository.create({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newUser;
  }

  async createWithPassword(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<User> {
    await this.ensureInitialized();
    const { password, ...userDataWithoutPassword } = userData;

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with hashed password
    const newUser = await this.userRepository.create({
      ...userDataWithoutPassword,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newUser;
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    await this.ensureInitialized();
    return await this.userRepository.update(id, userData);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return await this.userRepository.delete(id);
  }

  async authenticate(
    email: string,
    password: string
  ): Promise<{ user: User; token: string } | null> {
    await this.ensureInitialized();
    const user = await this.userRepository.findByEmail(email);

    if (!user?.password) {
      return null;
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }

    // Create JWT token
    const payload = {
      id: user._id?.toString() || user.id,
      uid: user.uid,
      email: user.email,
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET ?? "your-secret-key",
      {
        expiresIn: "7d",
      }
    );

    // Remove password from user object
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword as User,
      token,
    };
  }

  private generateToken(user: User): string {
    const payload = {
      uid: user.uid,
      email: user.email,
      role: user.role,
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET ?? "your-secret-key-change-this-in-production",
      { expiresIn: "24h" }
    );
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }
}
