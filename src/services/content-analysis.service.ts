import natural from 'natural';
import sentiment from 'sentiment';
import { ContentItem } from '../types';

const tokenizer = new natural.WordTokenizer();
const tfidf = new natural.TfIdf();
const sentimentAnalyzer = new sentiment();

type ContentAnalysis = Required<NonNullable<ContentItem['analysis']>>;

export class ContentAnalysisService {
  private static readonly KEYWORD_THRESHOLD = 0.2;
  private static readonly CATEGORIES = [
    'tech', 'humor', 'tutorial', 'news', 'opinion',
    'product', 'development', 'social', 'business'
  ];

  private static readonly CATEGORY_TERMS: Record<string, string[]> = {
    tech: [
      'technology', 'tech', 'digital', 'software', 'hardware', 'ai', 'code',
      'future', 'innovation', 'power', 'adapt', 'unleash', 'transform'
    ],
    humor: ['funny', 'hilarious', 'joke', 'lol', 'humor'],
    tutorial: ['how to', 'guide', 'learn', 'tutorial', 'step by step'],
    news: ['announcement', 'update', 'latest', 'breaking', 'news'],
    opinion: ['think', 'believe', 'opinion', 'perspective', 'view', 'discuss', 'insights'],
    product: ['product', 'device', 'gadget', 'tool', 'app', 'solution'],
    development: ['coding', 'programming', 'developer', 'engineering'],
    social: ['community', 'network', 'social', 'share', 'connect', 'discuss', 'insights'],
    business: ['business', 'startup', 'enterprise', 'company', 'market', 'transform']
  };

  private static readonly TECH_PATTERNS = [
    { 
      pattern: /\b(?:wifi|bluetooth|5g|4g|ai|ml|cloud|data|api|tech|digital|future|innovation)\b/gi, 
      type: 'technology'
    },
    { 
      pattern: /\b(?:iphone|android|macbook|device|computer|laptop|server|platform)\b/gi, 
      type: 'device'
    },
    { 
      pattern: /\b(?:google|apple|microsoft|meta|amazon|ibm|oracle)\b/gi, 
      type: 'company'
    },
    {
      pattern: /\b(?:transformation|revolution|innovation|advancement|breakthrough)\b/gi,
      type: 'concept'
    }
  ];

  private static readonly COMPOUND_TECH_PATTERNS = [
    { 
      terms: ['internet', 'things'],
      name: 'Internet of Things',
      type: 'technology',
      aliases: ['iot']
    },
    {
      terms: ['artificial', 'intelligence'],
      name: 'Artificial Intelligence',
      type: 'technology',
      aliases: ['ai']
    },
    {
      terms: ['machine', 'learning'],
      name: 'Machine Learning',
      type: 'technology',
      aliases: ['ml']
    },
    {
      terms: ['cloud', 'computing'],
      name: 'Cloud Computing',
      type: 'technology',
      aliases: ['cloud']
    }
  ];

  private static readonly EMOJI_SENTIMENTS: Record<string, number> = {
    // Very Positive (1.0)
    '🔥': 1.0,  // fire
    '💪': 1.0,  // strength
    '🚀': 1.0,  // rocket
    '⭐': 1.0,  // star
    '💫': 1.0,  // sparkle
    '✨': 1.0,  // sparkles
    '🎮': 0.8,  // gaming
    '💻': 0.7,  // laptop
    '👩‍💻': 0.7, // tech person
    '⚡️': 0.8,  // lightning
    '✔️': 0.5,  // checkmark
    '🤖': 0.6,  // robot
    '🌐': 0.7,  // globe
    '👇': 0.3,  // pointing down
    '🔄': 0.5,  // refresh
    // Neutral (0)
    '❓': 0,    // question
    // Add more emojis as needed
  };

  private static readonly EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

  async analyzeContent(content: string): Promise<ContentAnalysis> {
    // Extract keywords using TF-IDF
    tfidf.addDocument(content);
    const keywords = this.extractKeywords(content);

    // Determine categories
    const categories = this.determineCategories(content);

    // Extract entities
    const entities = this.extractEntities(content);

    // Analyze sentiment with emoji consideration
    const textSentiment = sentimentAnalyzer.analyze(content).comparative;
    const emojiSentiment = this.calculateEmojiSentiment(content);
    
    // Combine text and emoji sentiment (70% text, 30% emoji)
    const combinedSentiment = textSentiment * 0.7 + emojiSentiment * 0.3;
    
    return {
      keywords,
      categories,
      entities,
      sentiment: this.normalizeSentiment(combinedSentiment),
      customAnalytics: {}
    };
  }

  private extractKeywords(content: string): string[] {
    const terms: { term: string; score: number }[] = [];
    tfidf.listTerms(0).forEach(item => {
      terms.push({ term: item.term, score: item.tfidf });
    });

    return terms
      .filter(term => term.score > ContentAnalysisService.KEYWORD_THRESHOLD)
      .map(term => term.term);
  }

  private determineCategories(content: string): string[] {
    const lowercaseContent = content.toLowerCase();
    return ContentAnalysisService.CATEGORIES.filter(category => {
      const categoryTerms = ContentAnalysisService.CATEGORY_TERMS[category] || [];
      return categoryTerms.some(term => lowercaseContent.includes(term));
    });
  }

  private extractEntities(content: string): Array<{name: string; type: string; sentiment?: number}> {
    const entityMap = new Map<string, { type: string; sentiments: number[] }>();
    const lowercaseContent = content.toLowerCase();
    
    // Check for regular patterns
    ContentAnalysisService.TECH_PATTERNS.forEach(({ pattern, type }) => {
      const matches = content.match(pattern) || [];
      matches.forEach(match => {
        const normalizedName = match.toLowerCase();
        const sentiment = this.getEntitySentiment(content, match);
        
        if (entityMap.has(normalizedName)) {
          const existing = entityMap.get(normalizedName)!;
          existing.sentiments.push(sentiment);
        } else {
          entityMap.set(normalizedName, {
            type,
            sentiments: [sentiment]
          });
        }
      });
    });

    // Check for compound patterns
    ContentAnalysisService.COMPOUND_TECH_PATTERNS.forEach(({ terms, name, type, aliases }) => {
      // Check for full compound term
      const joined = terms.join('\\s+');
      const compoundRegex = new RegExp(`\\b${joined}\\b`, 'gi');
      const compoundMatches = content.match(compoundRegex) || [];

      // Check for aliases
      const aliasMatches = aliases.filter(alias => 
        new RegExp(`\\b${alias}\\b`, 'i').test(lowercaseContent)
      );

      if (compoundMatches.length > 0 || aliasMatches.length > 0) {
        const normalizedName = name.toLowerCase();
        const sentiment = this.getEntitySentiment(content, name);
        
        if (entityMap.has(normalizedName)) {
          const existing = entityMap.get(normalizedName)!;
          existing.sentiments.push(sentiment);
        } else {
          entityMap.set(normalizedName, {
            type,
            sentiments: [sentiment]
          });
        }
      }
    });

    // Convert map to array and average sentiments
    return Array.from(entityMap.entries()).map(([name, { type, sentiments }]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
      type,
      sentiment: sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    }));
  }

  private getEntitySentiment(content: string, entity: string): number {
    const entityIndex = content.toLowerCase().indexOf(entity.toLowerCase());
    if (entityIndex === -1) return 0;

    // Get surrounding context (50 chars before and after)
    const start = Math.max(0, entityIndex - 50);
    const end = Math.min(content.length, entityIndex + entity.length + 50);
    const context = content.slice(start, end);

    // Consider both text and emoji sentiment in the context
    const textSentiment = sentimentAnalyzer.analyze(context).comparative;
    const emojiSentiment = this.calculateEmojiSentiment(context);
    
    // Combine sentiments (70% text, 30% emoji)
    return this.normalizeSentiment(textSentiment * 0.7 + emojiSentiment * 0.3);
  }

  private calculateEmojiSentiment(content: string): number {
    const emojis = content.match(ContentAnalysisService.EMOJI_REGEX) || [];
    if (emojis.length === 0) return 0;

    let totalSentiment = 0;
    let countedEmojis = 0;

    emojis.forEach(emoji => {
      if (emoji in ContentAnalysisService.EMOJI_SENTIMENTS) {
        totalSentiment += ContentAnalysisService.EMOJI_SENTIMENTS[emoji];
        countedEmojis++;
      }
    });

    // If we found emojis but none were in our sentiment map, return neutral
    if (countedEmojis === 0) return 0;

    // Return average sentiment of recognized emojis
    return totalSentiment / countedEmojis;
  }

  private normalizeSentiment(score: number): number {
    return Math.max(-1, Math.min(1, score));
  }
}
