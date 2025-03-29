import { Organization } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";

export class OrganizationService {
  private organizationRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.organizationRepository =
      await RepositoryFactory.createOrganizationRepository();
  }

  async findById(id: string): Promise<Organization | null> {
    return await this.organizationRepository.findById(id);
  }

  async findByName(name: string): Promise<Organization | null> {
    return await this.organizationRepository.findByName(name);
  }

  async findAll(): Promise<Organization[]> {
    return await this.organizationRepository.find({});
  }

  async findByType(type: Organization["type"]): Promise<Organization[]> {
    return await this.organizationRepository.findByType(type);
  }

  async create(
    orgData: Omit<Organization, "id" | "createdAt" | "updatedAt">
  ): Promise<Organization> {
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
    return await this.organizationRepository.update(id, orgData);
  }

  async delete(id: string): Promise<boolean> {
    return await this.organizationRepository.delete(id);
  }

  private generateOrgId(): string {
    // Simple ID generation
    return "org_" + Math.random().toString(36).substr(2, 9);
  }
}
