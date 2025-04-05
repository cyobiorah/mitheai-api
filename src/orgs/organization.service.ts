import { Organization } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";

export class OrganizationService {
  private organizationRepository: any;
  private static instance: OrganizationService | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.organizationRepository = await RepositoryFactory.createOrganizationRepository();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize OrganizationService:", error);
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

  public static getInstance(): OrganizationService {
    if (!OrganizationService.instance) {
      OrganizationService.instance = new OrganizationService();
    }
    return OrganizationService.instance;
  }

  async findById(id: string): Promise<Organization | null> {
    await this.ensureInitialized();
    return await this.organizationRepository.findById(id);
  }

  async findByName(name: string): Promise<Organization | null> {
    await this.ensureInitialized();
    return await this.organizationRepository.findByName(name);
  }

  async findAll(): Promise<Organization[]> {
    await this.ensureInitialized();
    return await this.organizationRepository.find({});
  }

  async findByType(type: Organization["type"]): Promise<Organization[]> {
    await this.ensureInitialized();
    return await this.organizationRepository.findByType(type);
  }

  async create(
    orgData: Omit<Organization, "id" | "createdAt" | "updatedAt">
  ): Promise<Organization> {
    await this.ensureInitialized();
    // Generate a unique ID for the organization
    const newOrg = await this.organizationRepository.create({
      ...orgData,
      id: this.generateOrgId(),
    } as Organization);

    return newOrg;
  }

  async update(
    id: string,
    orgData: Partial<Organization>
  ): Promise<Organization | null> {
    await this.ensureInitialized();
    return await this.organizationRepository.update(id, orgData);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return await this.organizationRepository.delete(id);
  }

  private generateOrgId(): string {
    // Simple ID generation
    return "org_" + Math.random().toString(36).substr(2, 9);
  }
}
