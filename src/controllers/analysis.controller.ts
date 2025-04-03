import { Request, Response } from "express";
import { AnalysisTemplate, User, ContentItem } from "../types";

const db: any = {};

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { name, description, type, config, teamId } = req.body;
    const user = req.user as User;

    if (!name || !type || !config) {
      return res.status(400).json({
        error: "Missing required fields: name, type, config",
      });
    }

    // Additional validation for organization users
    if (user.userType === "organization") {
      if (!teamId) {
        return res.status(400).json({
          error: "Team ID is required for organization users",
        });
      }

      if (!user.teamIds?.includes(teamId)) {
        return res.status(403).json({
          error: "You do not have permission to create templates for this team",
        });
      }
    }

    const template: Omit<AnalysisTemplate, "id"> = {
      name,
      description,
      type,
      config,
      teamId: user.userType === "organization" ? teamId : null,
      organizationId:
        user.userType === "organization" ? user.organizationId || null : null,
      settings: {
        permissions: [],
        autoApply: false,
        contentTypes: config.contentTypes || ["article", "social_post"],
      },
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection("analysisTemplates").add(template);
    const doc = await docRef.get();

    res.status(201).json({
      ...doc.data(),
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error creating template:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("analysisTemplates").doc(templateId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = doc.data() as AnalysisTemplate;

    // For organization users
    if (user.userType === "organization") {
      if (template.teamId && !user.teamIds?.includes(template.teamId)) {
        return res.status(403).json({
          error: "You do not have permission to view this template",
        });
      }
    }
    // For individual users
    else {
      if (template.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to view this template",
        });
      }
    }

    res.json({
      ...template,
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error getting template:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const updates = req.body;
    const user = req.user as User;

    const doc = await db.collection("analysisTemplates").doc(templateId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = doc.data() as AnalysisTemplate;

    // For organization users
    if (user.userType === "organization") {
      if (template.teamId && !user.teamIds?.includes(template.teamId)) {
        return res.status(403).json({
          error: "You do not have permission to update this template",
        });
      }
    }
    // For individual users
    else {
      if (template.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to update this template",
        });
      }
    }

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.organizationId;
    delete updates.teamId;

    await doc.ref.update({
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await doc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error updating template:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("analysisTemplates").doc(templateId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Template not found" });
    }

    const template = doc.data() as AnalysisTemplate;

    // For organization users
    if (user.userType === "organization") {
      if (template.teamId && !user.teamIds?.includes(template.teamId)) {
        return res.status(403).json({
          error: "You do not have permission to delete this template",
        });
      }
    }
    // For individual users
    else {
      if (template.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to delete this template",
        });
      }
    }

    await doc.ref.delete();

    res.json({ message: "Template deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting template:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
};

export const listTeamTemplates = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const user = req.user as User;

    // For organization users
    if (user.userType === "organization") {
      if (!user.teamIds || !user.teamIds?.includes(teamId)) {
        return res.status(403).json({
          error: "You do not have permission to view templates for this team",
        });
      }

      const snapshot = await db
        .collection("analysisTemplates")
        .where("teamId", "==", teamId)
        .orderBy("createdAt", "desc")
        .get();

      const templates = snapshot.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id,
      }));

      res.json(templates);
    }
    // For individual users
    else {
      const snapshot = await db
        .collection("analysisTemplates")
        .where("createdBy", "==", user.uid)
        .where("teamId", "==", null)
        .get();

      const templates = snapshot.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id,
      }));

      res.json(templates);
    }
  } catch (error: unknown) {
    console.error("Error listing team templates:", error);
    res.status(500).json({
      error: "Failed to list team templates",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const getPersonalTemplates = async (req: Request, res: Response) => {
  try {
    const user = req.user as User;

    // Verify this is an individual user
    if (user.userType !== "individual") {
      return res.status(403).json({
        error: "This endpoint is only for individual users",
      });
    }

    const snapshot = await db
      .collection("analysisTemplates")
      .where("createdBy", "==", user.uid)
      .where("teamId", "==", null)
      .orderBy("createdAt", "desc")
      .get();

    const templates = snapshot.docs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    }));

    res.json(templates);
  } catch (error: unknown) {
    console.error("Error getting personal templates:", error);
    res.status(500).json({ error: "Failed to get personal templates" });
  }
};

export const applyTemplate = async (req: Request, res: Response) => {
  try {
    const { templateId, contentId } = req.params;
    const user = req.user as User;

    // Get both template and content documents
    const [templateDoc, contentDoc] = await Promise.all([
      db.collection("analysisTemplates").doc(templateId).get(),
      db.collection("content").doc(contentId).get(),
    ]);

    if (!templateDoc.exists) {
      return res.status(404).json({ error: "Template not found" });
    }
    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const template = templateDoc.data() as AnalysisTemplate;
    const content = contentDoc.data() as ContentItem;

    // For organization users
    if (user.userType === "organization") {
      // Verify user has access to both template and content
      if (
        (template.teamId && !user.teamIds?.includes(template.teamId)) ||
        (content.teamId && !user.teamIds?.includes(content.teamId))
      ) {
        return res.status(403).json({
          error:
            "You do not have permission to apply this template to this content",
        });
      }
    }
    // For individual users
    else {
      // Verify user owns both the template and content
      if (template.createdBy !== user.uid || content.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to analyze this content",
        });
      }
    }

    // Verify content type is supported by template
    if (!template.settings.contentTypes.includes(content.type)) {
      return res.status(400).json({
        error: `This template does not support content type: ${content.type}`,
      });
    }

    // TODO: Implement actual analysis logic here using template.config
    // This would typically involve:
    // 1. Preprocessing the content based on template.config.preprocessors
    // 2. Calling external APIs or services specified in template.config.models
    // 3. Postprocessing results based on template.config.postprocessors

    // For now, we'll just update the content status
    await contentDoc.ref.update({
      status: "analyzed",
      analyzedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await contentDoc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error applying template:", error);
    res.status(500).json({ error: "Failed to apply template" });
  }
};
