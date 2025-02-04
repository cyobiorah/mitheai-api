import { Request, Response } from 'express';
import { collections, db } from '../config/firebase';
import { Team, User } from '../types';
import { DocumentData } from 'firebase-admin/firestore';

export const createTeam = async (req: Request, res: Response) => {
  try {
    const { name, organizationId } = req.body;

    // Validate required fields
    if (!name || !organizationId) {
      return res.status(400).json({
        error: 'Missing required fields: name, organizationId',
      });
    }

    // Create new team
    const newTeam: Team = {
      id: '', // Will be set after creation
      name,
      organizationId,
      memberIds: [],
      settings: {
        permissions: ['basic'],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const teamRef = await collections.teams.add(newTeam);
    newTeam.id = teamRef.id;
    await teamRef.update({ id: teamRef.id });

    res.status(201).json(newTeam);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
};

export const getTeams = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required parameter: organizationId',
      });
    }

    const teamsSnapshot = await collections.teams
      .where('organizationId', '==', organizationId)
      .get();

    const teams = teamsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(teams);
  } catch (error) {
    console.error('Error getting teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
};

export const getTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id',
      });
    }

    const team = await collections.teams.doc(id).get();

    if (!team.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({
      id: team.id,
      ...team.data(),
    });
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id',
      });
    }

    await collections.teams.doc(id).update({
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    const updatedTeam = await collections.teams.doc(id).get();

    res.json({
      id: updatedTeam.id,
      ...updatedTeam.data(),
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id',
      });
    }

    const team = await collections.teams.doc(id).get();

    if (!team.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const teamData = team.data() as Team;

    // Remove team from all members
    const batch = db.batch();
    const membersSnapshot = await collections.users
      .where('teamIds', 'array-contains', id)
      .get();

    membersSnapshot.docs.forEach(doc => {
      const user = doc.data() as User;
      const updatedTeamIds = user.teamIds?.filter(teamId => teamId !== id) || [];
      batch.update(doc.ref, { teamIds: updatedTeamIds });
    });

    // Delete the team
    batch.delete(team.ref);

    await batch.commit();

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
};

export const addTeamMember = async (req: Request, res: Response) => {
  try {
    const { teamId, userId } = req.params;

    if (!teamId || !userId) {
      return res.status(400).json({
        error: 'Missing required parameters: teamId, userId',
      });
    }

    // First try to find user by uid (Firebase Auth ID)
    const usersSnapshot = await collections.users
      .where('uid', '==', userId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userDoc = usersSnapshot.docs[0];
    const teamRef = collections.teams.doc(teamId);
    const team = await teamRef.get();

    if (!team.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const teamData = team.data() as Team;
    const userData = userDoc.data() as User;

    if (teamData.memberIds.includes(userId)) {
      return res.status(400).json({ error: 'User is already a member of this team' });
    }

    const batch = db.batch();

    // Add user to team using uid
    batch.update(teamRef, {
      memberIds: [...teamData.memberIds, userId],
      updatedAt: new Date().toISOString(),
    });

    // Add team to user
    batch.update(userDoc.ref, {
      teamIds: [...(userData.teamIds || []), teamId],
      updatedAt: new Date().toISOString(),
    });

    await batch.commit();

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
};

export const removeTeamMember = async (req: Request, res: Response) => {
  try {
    const { teamId, userId } = req.params;

    if (!teamId || !userId) {
      return res.status(400).json({
        error: 'Missing required parameters: teamId, userId',
      });
    }

    const teamRef = collections.teams.doc(teamId);
    const userRef = collections.users.doc(userId);

    const [team, user] = await Promise.all([
      teamRef.get(),
      userRef.get(),
    ]);

    if (!team.exists) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (!user.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const teamData = team.data() as Team;
    const userData = user.data() as User;

    if (!teamData.memberIds.includes(userId)) {
      return res.status(400).json({ error: 'User is not a member of this team' });
    }

    const batch = db.batch();

    // Remove user from team
    batch.update(teamRef, {
      memberIds: teamData.memberIds.filter(id => id !== userId),
      updatedAt: new Date().toISOString(),
    });

    // Remove team from user
    batch.update(userRef, {
      teamIds: (userData.teamIds || []).filter(id => id !== teamId),
      updatedAt: new Date().toISOString(),
    });

    await batch.commit();

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
};
