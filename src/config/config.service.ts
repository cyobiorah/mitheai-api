import dotenv from 'dotenv';

export class ConfigService {
  private static instance: ConfigService;
  private config: { [key: string]: string | undefined };

  private constructor() {
    console.log('[ConfigService] Initializing ConfigService...');
    const result = dotenv.config();
    if (result.error) {
      console.error('[ConfigService] Error loading .env file:', result.error);
    } else {
      console.log('[ConfigService] Successfully loaded .env file');
    }
    this.config = process.env;
    this.debug();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get(key: string, defaultValue: string = ''): string {
    const value = this.config[key];
    if (value === undefined) {
      console.log(`[ConfigService] Warning: ${key} is undefined, using default value: ${defaultValue}`);
    } else {
      console.log(`[ConfigService] ${key} value length: ${value.length}`);
    }
    return value || defaultValue;
  }

  public debug(): void {
    console.log('[ConfigService] Debug: Config values:');
    for (const key in this.config) {
      if (key.includes('KEY') || key.includes('SECRET')) {
        console.log(`[ConfigService] ${key} = [HIDDEN] (length: ${this.config[key]?.length || 0})`);
      } else {
        console.log(`[ConfigService] ${key} = ${this.config[key]}`);
      }
    }
  }
}