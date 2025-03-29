import { User } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export class UserService {
  private userRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.userRepository = await RepositoryFactory.createUserRepository();
  }

  async findById(id: string): Promise<User | null> {
    return await this.userRepository.findById(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findByEmail(email);
  }

  async findOne(query: any): Promise<User | null> {
    return await this.userRepository.findOne(query);
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    return await this.userRepository.findByOrganization(organizationId);
  }

  async findByTeam(teamId: string): Promise<User[]> {
    return await this.userRepository.findByTeam(teamId);
  }

  async create(
    userData: Omit<User, "uid" | "createdAt" | "updatedAt">
  ): Promise<User> {
    // Create user without password for now
    const newUser = await this.userRepository.create({
      ...userData,
      uid: this.generateUid(),
      status: userData.status || "pending",
    } as User);

    return newUser;
  }

  async createWithPassword(
    userData: Omit<User, "uid" | "createdAt" | "updatedAt"> & {
      password: string;
    }
  ): Promise<User> {
    const { password, ...userDataWithoutPassword } = userData;

    // Hash the password
    const hashedPassword = await this.hashPassword(password);

    // Create user with hashed password
    const newUser = await this.userRepository.create({
      ...userDataWithoutPassword,
      uid: this.generateUid(),
      status: userData.status || "pending",
      password: hashedPassword, // Store hashed password
    } as any);

    // Remove password from returned user object
    const { password: _, ...userWithoutPassword } = newUser as any;
    return userWithoutPassword as User;
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    return await this.userRepository.update(id, userData);
  }

  async delete(id: string): Promise<boolean> {
    return await this.userRepository.delete(id);
  }

  async authenticate(
    email: string,
    password: string
  ): Promise<{ user: User; token: string } | null> {
    const user = (await this.userRepository.findByEmail(email)) as any;

    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    // Generate JWT token
    const token = this.generateToken(user);

    // Remove password from returned user object
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
      process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
      { expiresIn: "24h" }
    );
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  private generateUid(): string {
    // Simple UUID generation
    return "user_" + Math.random().toString(36).substr(2, 9);
  }
}
