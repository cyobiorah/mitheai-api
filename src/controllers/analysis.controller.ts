import { Request, Response } from 'express';
import { db } from '../config/firebase';
import { AnalysisTemplate, User, ContentItem } from '../types';

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { name, description, type, config, teamId } = req.body;
    const user = req.user as User;

    if (!name || !type || !config || !teamId) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, config, teamId'
      });
    }

    // Verify user belongs to team
    if (!user.teamIds.includes(teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to create templates for this team'
      });
    }

    const template: Omit<AnalysisTemplate, 'id'> = {
      name,
      description,
      type,
      config,
      teamId,
      organizationId: user.organizationId,
      settings: {
        permissions: [],
        autoApply: false,
        contentTypes: config.contentTypes || ['article', 'social_post']
      },
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('analysisTemplates').add(template);
    const doc = await docRef.get();

    res.status(201).json({
      ...doc.data(),
      id: doc.id
    });
  } catch (error: unknown) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const user = req.user as User;

    const doc = await db.collection('analysisTemplates').doc(templateId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = doc.data() as AnalysisTemplate;

    // Verify user has access to this template
    if (!user.teamIds.includes(template.teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to view this template'
      });
    }

    res.json({
      ...template,
      id: doc.id
    });
  } catch (error: unknown) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;
    const user = req.user as User;

    const doc = await db.collection('analysisTemplates').doc(templateId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = doc.data() as AnalysisTemplate;

    // Verify user has access to this template
    if (!user.teamIds.includes(template.teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to update this template'
      });
    }

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.organizationId;
    delete updates.teamId;

    await doc.ref.update({
      ...updates,
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await doc.ref.get();
    
    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id
    });
  } catch (error: unknown) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const user = req.user as User;

    const doc = await db.collection('analysisTemplates').doc(templateId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = doc.data() as AnalysisTemplate;

    // Verify user has access to this template
    if (!user.teamIds.includes(template.teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to delete this template'
      });
    }

    await doc.ref.delete();
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

export const listTeamTemplates = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    // Handle new users or users in onboarding
    if (user.isNewUser) {
      return res.json([]);  // Return empty array for new users
    }

    // Verify user belongs to team
    if (!user.teamIds || !user.teamIds.includes(teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to view templates for this team'
      });
    }

    const snapshot = await db.collection('analysisTemplates')
      .where('teamId', '==', teamId)
      .orderBy('createdAt', 'desc')
      .get();

    const templates = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    res.json(templates);
  } catch (error: unknown) {
    console.error('Error listing team templates:', error);
    res.status(500).json({
      error: 'Failed to list team templates',
      details: process.env.NODE_ENV === 'development' ? 
        error instanceof Error ? error.message : String(error) 
        : undefined
    });
  }
};

export const applyTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId, contentId } = req.params;
    const user = req.user as User;

    // Get both template and content documents
    const [templateDoc, contentDoc] = await Promise.all([
      db.collection('analysisTemplates').doc(templateId).get(),
      db.collection('content').doc(contentId).get()
    ]);
    
    if (!templateDoc.exists) {
      return res.status(404).json({ error: 'Template not found' });
    }
    if (!contentDoc.exists) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const template = templateDoc.data() as AnalysisTemplate;
    const content = contentDoc.data() as ContentItem;

    // Verify user has access to both template and content
    if (!user.teamIds.includes(template.teamId) || !user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: 'You do not have permission to apply this template to this content'
      });
    }

    // Verify content type is supported by template
    if (!template.settings.contentTypes.includes(content.type)) {
      return res.status(400).json({
        error: `This template does not support content type: ${content.type}`
      });
    }

    // TODO: Implement actual analysis logic here using template.config
    // This would typically involve:
    // 1. Preprocessing the content based on template.config.preprocessors
    // 2. Calling external APIs or services specified in template.config.models
    // 3. Postprocessing results based on template.config.postprocessors

    // For now, we'll just update the content status
    await contentDoc.ref.update({
      status: 'analyzed',
      analyzedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await contentDoc.ref.get();
    
    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id
    });
  } catch (error: unknown) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
};
