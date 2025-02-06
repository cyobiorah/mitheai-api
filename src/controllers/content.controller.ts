import { Request, Response } from "express";
import { db } from "../config/firebase";
import { ContentItem, User } from "../types";
import { AIAssistantRequest, SocialPlatform, ContentTone, ContentPurpose } from "../services/ai/types";
import { aiService } from "../config/ai.config";

interface GenerateContentRequest {
  type: "caption" | "hashtags" | "variation" | "optimization";
  content?: string;
  context: {
    platform: SocialPlatform;
    tone: ContentTone;
    purpose: ContentPurpose;
    targetAudience: string;
    keywords: string[];
    ctaType?: 'question' | 'engagement' | 'purchase' | 'visit' | 'tag';
    contentStyle?: 'storytelling' | 'listicle' | 'informative' | 'direct';
    toneIntensity?: 'light' | 'moderate' | 'strong';
    length?: {
      min: number;
      max: number;
      unit: "characters" | "words";
    };
  };
  constraints?: {
    mustInclude?: string[];
    mustExclude?: string[];
    hashtagCount?: number;
    emojiUsage?: 'none' | 'minimal' | 'moderate' | 'heavy';
  };
}

export const generateContent = async (
  req: Request<{}, {}, GenerateContentRequest>,
  res: Response
) => {
  try {
    const { type, content, context, constraints } = req.body;

    // Define content length ranges based on user selection
    const lengthRange = context.length
      ? `Ensure the content length is between ${context.length.min} and ${context.length.max} ${context.length.unit}.`
      : "";

    // Define call-to-action strategy
    const ctaInstructions = context.ctaType
      ? `End the content with a strong CTA that encourages the reader to ${
          context.ctaType === "question"
            ? "engage by answering a question"
            : context.ctaType === "engagement"
            ? "like, comment, or share"
            : context.ctaType === "purchase"
            ? "take immediate action to buy"
            : context.ctaType === "visit"
            ? "click a link to learn more"
            : "tag friends who might find this helpful"
        }.`
      : "";

    // Define content style preference
    const contentStyleInstructions = context.contentStyle
      ? `The content should follow a ${
          context.contentStyle === "storytelling"
            ? "story-driven"
            : context.contentStyle === "listicle"
            ? "bullet-point list"
            : context.contentStyle === "informative"
            ? "data-driven and factual"
            : "persuasive, direct"
        } style.`
      : "";

    // Define tone intensity handling for AI output
    const toneGuidelines = context.toneIntensity
      ? `The tone should be ${
          context.toneIntensity === "light"
            ? "lightly expressive"
            : context.toneIntensity === "moderate"
            ? "moderate with some personality"
            : "strong and highly expressive"
        }, ensuring it resonates with the audience.`
      : "";

    // Define the main system prompt with more detailed instructions
    let systemPrompt = `You are an expert social media content creator and copywriter specializing in ${context.platform} content. You have years of experience crafting viral, engaging content that drives real business results.

Your task is to create ${type === "caption" ? "a compelling caption" : type} that will stand out in the ${context.platform} feed and drive meaningful engagement.

Content Requirements:
- Maintain a ${context.tone} tone consistently throughout
- Focus on ${context.purpose} as the primary goal
- Specifically target and resonate with ${context.targetAudience}
- Naturally incorporate these keywords: ${context.keywords.join(", ")}
${lengthRange}
${ctaInstructions}
${contentStyleInstructions}
${toneGuidelines}

Platform-Specific Best Practices for ${context.platform}:
${context.platform === "linkedin" 
  ? "- Professional yet conversational tone\n- Focus on industry insights and thought leadership\n- Use data points and experience to build credibility\n- Structure content for easy scanning (bullets, spacing)\n- End with a clear, professional call-to-action"
  : context.platform === "twitter"
  ? "- Be concise and impactful\n- Use strong hooks in the first line\n- Create conversation-worthy statements\n- Use line breaks strategically\n- Make effective use of Twitter's format"
  : context.platform === "facebook"
  ? "- Focus on storytelling and community building\n- Use relatable, friendly language\n- Encourage discussion and sharing\n- Balance professional with personal touch\n- Make content easily shareable"
  : "- Prioritize visual appeal in descriptions\n- Use emotive, lifestyle-focused language\n- Create scroll-stopping first lines\n- Balance aspirational with authentic\n- Strategic hashtag placement"}

Content Structure Guidelines:
1. Start with a powerful hook that grabs attention
2. Develop your main point clearly and concisely
3. Support with relevant details or examples
4. End with a strong call-to-action
5. Add hashtags strategically (if applicable)

Tone and Style Notes:
- Keep the voice ${context.toneIntensity === "light" ? "subtle and professional" : context.toneIntensity === "moderate" ? "balanced and engaging" : "bold and distinctive"}
- Focus on value-first content that serves the audience
- Avoid generic, overused phrases
- Make every word count`;

    // Enhanced user prompt with more specific instructions
    let userPrompt = `Create ${type === "caption" ? "a" : ""} ${type} that follows these specific requirements:`;

    if (content) {
      userPrompt += `\nBase it on this content, but enhance it: "${content}"`;
    }

    userPrompt += `
Key Elements to Include:
- Tone: ${context.tone} (maintain this consistently)
- Purpose: ${context.purpose} (make this clear without being obvious)
- Target Audience: ${context.targetAudience} (speak directly to their needs)
- Keywords: ${context.keywords.join(", ")} (integrate naturally)

Style Requirements:
${context.contentStyle === "storytelling"
  ? "Tell a compelling story that draws the reader in and makes them want to engage"
  : context.contentStyle === "listicle"
  ? "Present information in a clear, structured format with distinct points"
  : context.contentStyle === "informative"
  ? "Focus on delivering valuable insights backed by expertise"
  : "Be direct and persuasive, focusing on clear value propositions"}

Remember to:
1. Start with an attention-grabbing opening
2. Maintain reader interest throughout
3. End with a clear, compelling call-to-action
4. Keep the content authentic and valuable`;

    if (constraints) {
      if (constraints.mustInclude?.length) {
        userPrompt += `\n\nRequired phrases (integrate naturally): ${constraints.mustInclude.join(", ")}`;
      }
      if (constraints.mustExclude?.length) {
        userPrompt += `\n\nAvoid these phrases: ${constraints.mustExclude.join(", ")}`;
      }
      if (constraints.hashtagCount) {
        userPrompt += `\n\nInclude exactly ${constraints.hashtagCount} relevant, strategic hashtags`;
      }
      if (constraints.emojiUsage) {
        userPrompt += `\n\nEmoji usage: ${constraints.emojiUsage} (use to enhance, not distract)`;
      }
    }

    console.log("[DEBUG] Calling OpenAI with prompts:", {
      systemPrompt,
      userPrompt,
    });
    const completion = await aiService.createCompletion({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    console.log("[DEBUG] OpenAI response:", completion);

    // Extract hashtags if they exist
    const hashtags = completion.content.match(/#[a-zA-Z0-9_]+/g) || [];
    const contentWithoutHashtags = completion.content
      .replace(/#[a-zA-Z0-9_]+/g, "")
      .trim();

    // Parse the response and extract suggestions
    const suggestions = [
      {
        content: contentWithoutHashtags,
        hashtags,
        confidence: 0.9,
        metadata: {
          tone: context.tone,
          readabilityScore: 0.8,
          estimatedEngagement: 0.85,
          platformSpecificMetrics: {
            [context.platform]: {
              lengthOptimal:
                contentWithoutHashtags.length >= (context.length?.min || 50) &&
                contentWithoutHashtags.length <= (context.length?.max || 500),
              hashtagCountOptimal: constraints?.hashtagCount
                ? hashtags.length === constraints.hashtagCount
                : true,
              mediaRecommended: context.platform === "instagram",
            },
          },
        },
      },
    ];

    // Generate improvements based on content analysis
    const improvements = [];

    // Check content length
    if (contentWithoutHashtags.length < (context.length?.min || 50)) {
      improvements.push({
        type: "length",
        suggestion: "Consider adding more detail to increase engagement",
        impact: "medium",
      });
    }

    // Check keyword usage
    const missingKeywords = context.keywords.filter(
      (keyword) =>
        !contentWithoutHashtags.toLowerCase().includes(keyword.toLowerCase())
    );
    if (missingKeywords.length > 0) {
      improvements.push({
        type: "structure",
        suggestion: `Try incorporating these keywords: ${missingKeywords.join(
          ", "
        )}`,
        impact: "high",
      });
    }

    // Platform-specific improvements
    if (
      context.platform === "linkedin" &&
      contentWithoutHashtags.length < 100
    ) {
      improvements.push({
        type: "structure",
        suggestion:
          "LinkedIn posts perform better with detailed, professional context",
        impact: "medium",
      });
    }

    res.json({ suggestions, improvements });
  } catch (error: any) {
    console.error("[ERROR] Failed to generate content:", error);
    res.status(500).json({
      error: "Failed to generate content",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
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
