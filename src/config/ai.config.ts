import { OpenAIService } from "../services/ai/openai.service";
import { AIServiceConfig } from "../services/ai/types";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

export const aiConfig: AIServiceConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model:
    (process.env.OPENAI_MODEL as "gpt-3.5-turbo" | "gpt-4") || "gpt-3.5-turbo",
  maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "500"),
  temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.7"),
};

export const aiService = new OpenAIService(aiConfig);
