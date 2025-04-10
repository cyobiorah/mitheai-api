import { OpenAIService } from "../services/ai/openai.service";
import { AIServiceConfig } from "../services/ai/types";
import { ConfigService } from "./config.service";

const configService = ConfigService.getInstance();

const apiKey = configService.get("OPENAI_API_KEY");

if (!apiKey) {
  console.error(
    "[AIConfig] OPENAI_API_KEY is missing from environment variables"
  );
  throw new Error("OPENAI_API_KEY is required");
}

export const aiConfig: AIServiceConfig = {
  apiKey,
  model: configService.get("OPENAI_MODEL", "gpt-4") as
    | "gpt-3.5-turbo"
    | "gpt-4",
  maxTokens: parseInt(configService.get("OPENAI_MAX_TOKENS", "1000")),
  temperature: parseFloat(configService.get("OPENAI_TEMPERATURE", "0.85")),
};

export const aiService = new OpenAIService(aiConfig);
