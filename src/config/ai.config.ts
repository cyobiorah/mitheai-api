import { OpenAIService } from "../services/ai/openai.service";
import { AIServiceConfig } from "../services/ai/types";
import { ConfigService } from "./config.service";

const configService = ConfigService.getInstance();

// console.log('\n[AIConfig] Initializing AI configuration...');
// configService.debug(); // This will show all environment variables

const apiKey = configService.get("OPENAI_API_KEY");

// console.log("[AIConfig] OPENAI_API_KEY:", apiKey);

if (!apiKey) {
  console.error("[AIConfig] OPENAI_API_KEY is missing from environment variables");
  throw new Error("OPENAI_API_KEY is required");
}

export const aiConfig: AIServiceConfig = {
  apiKey, // Use the key directly, no string interpolation needed
  model: configService.get("OPENAI_MODEL", "gpt-3.5-turbo") as "gpt-3.5-turbo" | "gpt-4",
  maxTokens: parseInt(configService.get("OPENAI_MAX_TOKENS", "500")),
  temperature: parseFloat(configService.get("OPENAI_TEMPERATURE", "0.7")),
};

export const aiService = new OpenAIService(aiConfig);
