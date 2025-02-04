import { Request, Response } from 'express';
import { collections } from '../config/firebase';
import { Organization } from '../types';

export const createOrUpdateOrganization = async (req: Request, res: Response) => {
  try {
    const { id, name, description, type } = req.body;

    if (!id || !name || !type) {
      return res.status(400).json({
        error: 'Missing required fields: id, name, type',
      });
    }

    // Validate organization type
    if (!['enterprise', 'business', 'startup'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid organization type. Must be one of: enterprise, business, startup',
      });
    }

    const organization: Organization = {
      id,
      name,
      description: description || undefined,  // Only set if provided
      type,
      settings: {
        permissions: [],
        maxTeams: type === 'enterprise' ? 999 : type === 'business' ? 10 : 3,
        maxUsers: type === 'enterprise' ? 999 : type === 'business' ? 50 : 10,
        features: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Use set with merge to update if exists, create if doesn't
    await collections.organizations.doc(id).set(organization, { merge: true });

    res.status(201).json(organization);
  } catch (error) {
    console.error('Error creating/updating organization:', error);
    res.status(500).json({ error: 'Failed to create/update organization' });
  }
};
