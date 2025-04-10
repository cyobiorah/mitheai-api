export class ConfigService {
  private static instance: ConfigService;
  private config: { [key: string]: string | undefined };

  private constructor() {
    this.config = process.env;
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public get(key: string, defaultValue: string = ""): string {
    const value = this.config[key];
    return value ?? defaultValue;
  }
}
