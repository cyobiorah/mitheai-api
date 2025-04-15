import { Team } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import { User } from "../appTypes";

export class TeamService {
  private teamRepository: any;
  private userRepository: any;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private static instance: TeamService | null = null;

  private constructor() {
    this.initPromise = this.initialize();
  }

  public static getInstance(): TeamService {
    if (!TeamService.instance) {
      TeamService.instance = new TeamService();
    }
    return TeamService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      this.teamRepository = await RepositoryFactory.createTeamRepository();
      this.userRepository = await RepositoryFactory.createUserRepository();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize TeamService:", error);
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

  async findById(id: string): Promise<Team | null> {
    await this.ensureInitialized();
    return await this.teamRepository.findById(id);
  }

  async findByOrganization(organizationId: string): Promise<Team[]> {
    await this.ensureInitialized();
    return await this.teamRepository.findByOrganization(organizationId);
  }

  async findByMember(userId: string): Promise<Team[]> {
    await this.ensureInitialized();
    return await this.teamRepository.findByMember(userId);
  }

  async create(
    teamData: Omit<Team, "id" | "createdAt" | "updatedAt">
  ): Promise<Team> {
    await this.ensureInitialized();

    // Ensure memberIds is initialized and contains at least one member (the creator)
    if (!teamData.memberIds || teamData.memberIds.length === 0) {
      throw new Error("Team must have at least one member (the creator)");
    }

    // Generate a unique ID for the team
    const newTeam = await this.teamRepository.create({
      ...teamData,
      id: this.generateTeamId(),
      memberIds: teamData.memberIds,
    } as Team);

    // Update all members' teamIds arrays
    const updatePromises = teamData.memberIds.map(async (userId) => {
      const user = await this.userRepository.findById(userId);
      if (user) {
        // Add the new team ID to the user's teamIds array if it's not already there
        const teamIds = user.teamIds || [];
        if (!teamIds.includes(newTeam.id)) {
          teamIds.push(newTeam.id);
          await this.userRepository.update(userId, { teamIds });
        }
      }
    });

    // Wait for all user updates to complete
    await Promise.all(updatePromises);

    return newTeam;
  }

  async update(id: string, teamData: Partial<Team>): Promise<Team | null> {
    await this.ensureInitialized();
    return await this.teamRepository.update(id, teamData);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();
    return await this.teamRepository.delete(id);
  }

  async addMember(teamId: string, userId: string): Promise<Team | null> {
    await this.ensureInitialized();

    // Add member to team
    const updatedTeam = await this.teamRepository.addMember(teamId, userId);
    if (!updatedTeam) return null;

    // Update user's teamIds
    const user = await this.userRepository.findById(userId);
    if (user) {
      const teamIds = user.teamIds || [];
      if (!teamIds.includes(teamId)) {
        teamIds.push(teamId);
        await this.userRepository.update(userId, { teamIds });
      }
    }

    return updatedTeam;
  }

  async removeMember(teamId: string, userId: string): Promise<Team | null> {
    await this.ensureInitialized();
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Remove user from team
    const updatedTeam = await this.teamRepository.removeMember(teamId, userId);
    if (!updatedTeam) {
      throw new Error("Failed to remove user from team");
    }

    // Update user's teamIds if needed
    if (user.teamIds?.includes(teamId)) {
      const teamIds = user.teamIds.filter((id: any) => id !== teamId);
      await this.userRepository.update(userId, { teamIds });
    }

    return updatedTeam;
  }

  async getMembers(teamId: string): Promise<User[]> {
    await this.ensureInitialized();
    const team = await this.teamRepository.findById(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    // Get all users in the team
    const members: User[] = [];
    for (const memberId of team.memberIds) {
      const user = await this.userRepository.findById(memberId);
      if (user) {
        members.push(user);
      }
    }

    return members;
  }

  private generateTeamId(): string {
    // Simple ID generation
    return "team_" + Math.random().toString(36).substr(2, 9);
  }
}
