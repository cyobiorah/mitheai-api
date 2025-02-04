export interface AIServiceConfig {
  apiKey: string;
  model: 'gpt-3.5-turbo' | 'gpt-4';
  maxTokens: number;
  temperature: number;
}

export type SocialPlatform = 'twitter' | 'linkedin' | 'facebook' | 'instagram';

export type ContentTone = 
  | 'professional'
  | 'casual'
  | 'friendly'
  | 'humorous'
  | 'informative'
  | 'persuasive';

export type ContentPurpose = 
  | 'engagement'
  | 'awareness'
  | 'lead_generation'
  | 'sales'
  | 'education'
  | 'entertainment';

export interface AIPrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIAssistantRequest {
  type: 'caption' | 'hashtags' | 'variation' | 'optimization';
  content?: string;
  context: {
    platform: SocialPlatform;
    tone: ContentTone;
    purpose: ContentPurpose;
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

export interface AIAssistantResponse {
  suggestions: Array<{
    content: string;
    hashtags?: string[];
    confidence: number;
    metadata: {
      tone: ContentTone;
      readabilityScore: number;
      estimatedEngagement: number;
      platformSpecificMetrics: {
        [key in SocialPlatform]?: {
          lengthOptimal: boolean;
          hashtagCountOptimal: boolean;
          mediaRecommended: boolean;
        };
      };
    };
  }>;
  improvements?: Array<{
    type: 'tone' | 'length' | 'hashtags' | 'structure';
    suggestion: string;
    impact: 'low' | 'medium' | 'high';
  }>;
}
