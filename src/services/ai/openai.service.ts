import OpenAI from 'openai';
import { AIServiceConfig } from './types';

export class OpenAIService {
  private client: OpenAI;
  private config: AIServiceConfig;
  private maxRetries = 2;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey
    });
  }

  async createCompletion(params: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }> }) {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.config.model,
          messages: params.messages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          presence_penalty: 0.1, // Slightly encourage new topics
          frequency_penalty: 0.2, // Reduce repetition
          top_p: 0.9, // Maintain focus while allowing some creativity
        });

        if (!completion.choices[0]?.message?.content) {
          throw new Error('No completion generated');
        }

        // Check for low-quality responses
        const content = completion.choices[0].message.content;
        if (content.length < 50 || content.split(' ').length < 10) {
          if (attempt < this.maxRetries) {
            continue; // Retry if response is too short
          }
          throw new Error('Generated content is too short');
        }

        return {
          content,
          usage: completion.usage
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('Failed to generate completion after retries');
  }
}
