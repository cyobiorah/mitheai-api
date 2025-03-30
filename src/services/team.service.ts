import { Team } from "../types";
import { RepositoryFactory } from "../repositories/repository.factory";
import { User } from "../app-types";

export class TeamService {
  private teamRepository: any;
  private userRepository: any;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.teamRepository = await RepositoryFactory.createTeamRepository();
    this.userRepository = await RepositoryFactory.createUserRepository();
  }

  async findById(id: string): Promise<Team | null> {
    return await this.teamRepository.findById(id);
  }

  async findByOrganization(organizationId: string): Promise<Team[]> {
    return await this.teamRepository.findByOrganization(organizationId);
  }

  async findByMember(userId: string): Promise<Team[]> {
    return await this.teamRepository.findByMember(userId);
  }

  async create(
    teamData: Omit<Team, "id" | "createdAt" | "updatedAt">
  ): Promise<Team> {
    // Generate a unique ID for the team
    const newTeam = await this.teamRepository.create({
      ...teamData,
      id: this.generateTeamId(),
      memberIds: teamData.memberIds || [],
    } as Team);

    return newTeam;
  }

  async update(id: string, teamData: Partial<Team>): Promise<Team | null> {
    return await this.teamRepository.update(id, teamData);
  }

  async delete(id: string): Promise<boolean> {
    return await this.teamRepository.delete(id);
  }

  async addMember(teamId: string, userId: string): Promise<Team | null> {
    // Check if user exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Add user to team
    const updatedTeam = await this.teamRepository.addMember(teamId, userId);
    if (!updatedTeam) {
      throw new Error("Failed to add user to team");
    }

    // Update user's teamIds if needed
    if (!user.teamIds?.includes(teamId)) {
      const teamIds = user.teamIds ? [...user.teamIds, teamId] : [teamId];
      await this.userRepository.update(userId, { teamIds });
    }

    return updatedTeam;
  }

  async removeMember(teamId: string, userId: string): Promise<Team | null> {
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
