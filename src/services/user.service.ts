import { User } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export class UserService {
  private userRepository: any;

  private constructor(userRepository: any) {
    this.userRepository = userRepository;
  }

  public static async create(): Promise<UserService> {
    const userRepository = await RepositoryFactory.createUserRepository();
    return new UserService(userRepository);
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
    return await this.userRepository.update(id, userData);
  }

  async delete(id: string): Promise<boolean> {
    return await this.userRepository.delete(id);
  }

  async authenticate(
    email: string,
    password: string
  ): Promise<{ user: User; token: string } | null> {
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
