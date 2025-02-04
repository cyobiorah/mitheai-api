import { Request, Response } from "express";
import { db } from "../config/firebase";
import { ContentItem, User } from "../types";
import { AIAssistantRequest } from "../services/ai/types";
import { aiService } from "../config/ai.config";

interface GenerateContentRequest {
  type: 'caption' | 'hashtags' | 'variation' | 'optimization';
  content?: string;
  context: {
    platform: string;
    tone: string;
    purpose: string;
    targetAudience: string;
    keywords: string[];
    length?: {
      min: number;
      max: number;
      unit: 'characters' | 'words';
    };
  };
  constraints?: {
    mustInclude?: string[];
    mustExclude?: string[];
    hashtagCount?: number;
    emojiUsage?: 'none' | 'minimal' | 'moderate' | 'heavy';
  };
}

export const generateContent = async (req: Request<{}, {}, GenerateContentRequest>, res: Response) => {
  try {
    const { type, content, context, constraints } = req.body;

    // Build the prompt based on request parameters
    let systemPrompt = `You are a professional social media content creator specializing in ${context.platform} content.
Your task is to create ${type === 'caption' ? 'a compelling caption' : type} that:
- Maintains a ${context.tone} tone
- Achieves the purpose of ${context.purpose}
- Resonates with ${context.targetAudience}
- Incorporates the following keywords naturally: ${context.keywords.join(', ')}

Follow these platform-specific best practices for ${context.platform}:
- LinkedIn: Professional, industry insights, thought leadership
- Twitter: Concise, engaging, conversation-starting
- Facebook: Community-focused, storytelling, engaging
- Instagram: Visual-first, authentic, lifestyle-oriented`;

    let userPrompt = `Create ${type === 'caption' ? 'a' : ''} ${type} that:`;
    
    if (content) {
      userPrompt += `\nBase it on this content: "${content}"`;
    }
    
    userPrompt += `\nTone: ${context.tone}`;
    userPrompt += `\nPurpose: ${context.purpose}`;
    userPrompt += `\nTarget Audience: ${context.targetAudience}`;
    userPrompt += `\nKeywords to include: ${context.keywords.join(', ')}`;

    if (constraints) {
      if (constraints.mustInclude?.length) {
        userPrompt += `\nMust include these phrases: ${constraints.mustInclude.join(', ')}`;
      }
      if (constraints.mustExclude?.length) {
        userPrompt += `\nMust avoid these phrases: ${constraints.mustExclude.join(', ')}`;
      }
      if (constraints.hashtagCount) {
        userPrompt += `\nInclude exactly ${constraints.hashtagCount} relevant hashtags`;
      }
      if (constraints.emojiUsage) {
        userPrompt += `\nEmoji usage level: ${constraints.emojiUsage}`;
      }
    }

    console.log('[DEBUG] Calling OpenAI with prompts:', { systemPrompt, userPrompt });
    const completion = await aiService.createCompletion({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    console.log('[DEBUG] OpenAI response:', completion);

    // Extract hashtags if they exist
    const hashtags = completion.content.match(/#[a-zA-Z0-9_]+/g) || [];
    const contentWithoutHashtags = completion.content.replace(/#[a-zA-Z0-9_]+/g, '').trim();

    // Parse the response and extract suggestions
    const suggestions = [{
      content: contentWithoutHashtags,
      hashtags,
      confidence: 0.9,
      metadata: {
        tone: context.tone,
        readabilityScore: 0.8,
        estimatedEngagement: 0.85,
        platformSpecificMetrics: {
          [context.platform]: {
            lengthOptimal: true,
            hashtagCountOptimal: constraints?.hashtagCount ? hashtags.length === constraints.hashtagCount : true,
            mediaRecommended: context.platform === 'instagram'
          }
        }
      }
    }];

    // Generate improvements based on content analysis
    const improvements = [];
    
    // Check content length
    if (contentWithoutHashtags.length < 50) {
      improvements.push({
        type: 'length',
        suggestion: 'Consider adding more detail to increase engagement',
        impact: 'medium'
      });
    }

    // Check keyword usage
    const missingKeywords = context.keywords.filter(keyword => 
      !contentWithoutHashtags.toLowerCase().includes(keyword.toLowerCase())
    );
    if (missingKeywords.length > 0) {
      improvements.push({
        type: 'structure',
        suggestion: `Try incorporating these keywords: ${missingKeywords.join(', ')}`,
        impact: 'high'
      });
    }

    // Platform-specific improvements
    if (context.platform === 'linkedin' && contentWithoutHashtags.length < 100) {
      improvements.push({
        type: 'structure',
        suggestion: 'LinkedIn posts perform better with detailed, professional context',
        impact: 'medium'
      });
    }

    res.json({ suggestions, improvements });
  } catch (error: any) {
    console.error('[ERROR] Failed to generate content:', error);
    console.error('[ERROR] Stack trace:', error.stack);
    if (error.response) {
      console.error('[ERROR] OpenAI API response:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    res.status(500).json({ 
      error: 'Failed to generate content',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const createContent = async (req: Request, res: Response) => {
  try {
    const { title, description, type, url, content, metadata, teamId } =
      req.body;
    const user = req.user as User; // From auth middleware

    if (!title || !type || !content || !teamId) {
      return res.status(400).json({
        error: "Missing required fields: title, type, content, teamId",
      });
    }

    // Verify user belongs to team
    if (!user.teamIds.includes(teamId)) {
      return res.status(403).json({
        error: "You do not have permission to create content for this team",
      });
    }

    const contentItem: Omit<ContentItem, "id"> = {
      title,
      description,
      type,
      url,
      content,
      metadata: {
        source: metadata?.source || "",
        language: metadata?.language || "en",
        tags: metadata?.tags || [],
        customFields: metadata?.customFields || {},
      },
      analysis: {},
      status: "pending",
      teamId,
      organizationId: user.organizationId,
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection("content").add(contentItem);
    const doc = await docRef.get();

    res.status(201).json({
      ...doc.data(),
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error creating content:", error);
    res.status(500).json({
      error: "Failed to create content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const getContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("content").doc(contentId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = doc.data() as ContentItem;

    // Verify user has access to this content
    if (!user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to view this content",
      });
    }

    res.json({
      ...content,
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error getting content:", error);
    res.status(500).json({
      error: "Failed to get content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const updateContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const updates = req.body;
    const user = req.user as User;

    const doc = await db.collection("content").doc(contentId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = doc.data() as ContentItem;

    // Verify user has access to this content
    if (!user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to update this content",
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
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await doc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error updating content:", error);
    res.status(500).json({
      error: "Failed to update content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const deleteContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("content").doc(contentId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = doc.data() as ContentItem;

    // Verify user has access to this content
    if (!user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to delete this content",
      });
    }

    await doc.ref.delete();

    res.json({ message: "Content deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting content:", error);
    res.status(500).json({
      error: "Failed to delete content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const analyzeContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { templateId } = req.body;
    const user = req.user as User;

    const doc = await db.collection("content").doc(contentId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = doc.data() as ContentItem;

    // Verify user has access to this content
    if (!user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to analyze this content",
      });
    }

    // TODO: Implement actual analysis logic here
    // This would typically involve calling an external API or service

    await doc.ref.update({
      status: "analyzed",
      analyzedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await doc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error analyzing content:", error);
    res.status(500).json({
      error: "Failed to analyze content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const archiveContent = async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("content").doc(contentId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const content = doc.data() as ContentItem;

    // Verify user has access to this content
    if (!user.teamIds.includes(content.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to archive this content",
      });
    }

    await doc.ref.update({
      status: "archived",
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await doc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error archiving content:", error);
    res.status(500).json({
      error: "Failed to archive content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

export const listTeamContent = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    // Handle new users or users in onboarding
    if (user.isNewUser) {
      return res.json([]); // Return empty array for new users
    }

    // Verify user belongs to team
    if (!user.teamIds || !user.teamIds.includes(teamId)) {
      return res.status(403).json({
        error: "You do not have permission to view content for this team",
      });
    }

    const snapshot = await db
      .collection("content")
      .where("teamId", "==", teamId)
      .orderBy("createdAt", "desc")
      .get();

    const content = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    res.json(content);
  } catch (error: unknown) {
    console.error("Error listing team content:", error);
    res.status(500).json({
      error: "Failed to list team content",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};
