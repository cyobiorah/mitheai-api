import OpenAI from 'openai';
import { AIServiceConfig } from './types';

export class OpenAIService {
  private client: OpenAI;
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey
    });
  }

  async createCompletion(params: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; }> }) {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: params.messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      if (!completion.choices[0]?.message?.content) {
        throw new Error('No completion generated');
      }

      return {
        content: completion.choices[0].message.content,
        usage: completion.usage
      };
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate content using OpenAI');
    }
  }
}
