import { 
  CoworkConfig, 
  ConfigManager, 
  ValidationResult, 
  CONFIG_FILE_NAMES,
  ConfigFileName,
  UserPreferences,
  SystemConfig,
  WorkspaceConfig,
  AIConfig
} from './types.js';
import { promises as fs } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

export class ConfigurationManager implements ConfigManager {
  private configPath: string | null = null;
  private defaultConfig: CoworkConfig;
  private currentConfig: CoworkConfig | null = null;

  constructor() {
    this.defaultConfig = this.createDefaultConfig();
  }

  async load(configPath?: string): Promise<CoworkConfig> {
    const targetPath = configPath || await this.findConfigFile();
    
    if (!targetPath) {
      console.warn('⚠️  No configuration file found, using defaults');
      this.currentConfig = this.defaultConfig;
      return this.defaultConfig;
    }

    try {
      const content = await fs.readFile(targetPath, 'utf-8');
      const config = this.parseConfigContent(content, targetPath);
      
      const validation = this.validate(config);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️  Configuration warnings:');
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      this.configPath = targetPath;
      this.currentConfig = config;
      
      console.log(`✅ Configuration loaded from: ${targetPath}`);
      return config;
      
    } catch (error) {
      console.error(`❌ Failed to load configuration from ${targetPath}:`, error);
      throw error;
    }
  }

  async save(config: CoworkConfig, configPath?: string): Promise<void> {
    const targetPath = configPath || this.configPath || 'cowork.yaml';
    const dir = dirname(targetPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Validate before saving
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(`Cannot save invalid configuration:\n${validation.errors.join('\n')}`);
    }

    try {
      const content = this.serializeConfig(config, targetPath);
      await fs.writeFile(targetPath, content, 'utf-8');
      
      this.configPath = targetPath;
      this.currentConfig = config;
      
      console.log(`✅ Configuration saved to: ${targetPath}`);
    } catch (error) {
      console.error(`❌ Failed to save configuration to ${targetPath}:`, error);
      throw error;
    }
  }

  validate(config: CoworkConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate basic structure
    if (!config.version) {
      errors.push('Missing configuration version');
    }

    if (!config.user) {
      errors.push('Missing user preferences section');
    }

    if (!config.system) {
      errors.push('Missing system configuration section');
    }

    if (!config.workspace) {
      errors.push('Missing workspace configuration section');
    }

    // Validate user preferences
    if (config.user) {
      const validOrgStyles = ['by-type', 'by-date', 'by-project', 'custom'];
      if (!validOrgStyles.includes(config.user.organizationStyle)) {
        errors.push(`Invalid organization style: ${config.user.organizationStyle}`);
      }

      const validRiskLevels = ['conservative', 'moderate', 'aggressive'];
      if (!validRiskLevels.includes(config.user.riskLevel)) {
        errors.push(`Invalid risk level: ${config.user.riskLevel}`);
      }

      if (config.user.favoriteActions && !Array.isArray(config.user.favoriteActions)) {
        errors.push('favoriteActions must be an array');
      }
    }

    // Validate system configuration
    if (config.system) {
      const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
      if (!validLogLevels.includes(config.system.logLevel)) {
        errors.push(`Invalid log level: ${config.system.logLevel}`);
      }

      if (typeof config.system.maxConcurrentTasks !== 'number' || config.system.maxConcurrentTasks < 1) {
        errors.push('maxConcurrentTasks must be a positive number');
      }

      if (config.system.cacheConfig) {
        if (config.system.cacheConfig.maxSize <= 0) {
          errors.push('cache maxSize must be positive');
        }
        if (config.system.cacheConfig.ttl <= 0) {
          errors.push('cache ttl must be positive');
        }
      }
    }

    // Validate AI configuration
    if (config.ai && config.ai.enabled) {
      if (!config.ai.providers || config.ai.providers.length === 0) {
        errors.push('AI enabled but no providers configured');
      }

      if (config.ai.providers) {
        config.ai.providers.forEach((provider, index) => {
          if (!provider.name) {
            errors.push(`Provider ${index}: missing name`);
          }
          if (!provider.type || !['openai', 'anthropic', 'local'].includes(provider.type)) {
            errors.push(`Provider ${index}: invalid type`);
          }
          if (provider.type !== 'local' && !provider.apiKey) {
            warnings.push(`Provider ${index}: missing API key`);
          }
        });
      }
    }

    // Validate workspace rules
    if (config.workspace && config.workspace.rules) {
      config.workspace.rules.fileOrganizations?.forEach((rule, index) => {
        if (!rule.name) {
          errors.push(`File organization rule ${index}: missing name`);
        }
        if (!rule.destination) {
          errors.push(`File organization rule ${index}: missing destination`);
        }
        if (!rule.pattern) {
          errors.push(`File organization rule ${index}: missing pattern`);
        }
        if (typeof rule.priority !== 'number' || rule.priority < 0) {
          errors.push(`File organization rule ${index}: invalid priority`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  merge(base: CoworkConfig, override: Partial<CoworkConfig>): CoworkConfig {
    return {
      ...base,
      ...override,
      user: { ...base.user, ...override.user },
      system: { ...base.system, ...override.system },
      workspace: { ...base.workspace, ...override.workspace },
      ai: { ...base.ai, ...override.ai },
      plugins: override.plugins || base.plugins
    };
  }

  getDefaults(): CoworkConfig {
    return this.defaultConfig;
  }

  async reset(): Promise<void> {
    this.currentConfig = this.defaultConfig;
    if (this.configPath) {
      await this.save(this.defaultConfig, this.configPath);
    }
  }

  getCurrentConfig(): CoworkConfig | null {
    return this.currentConfig;
  }

  getConfigPath(): string | null {
    return this.configPath;
  }

  private async findConfigFile(): Promise<string | null> {
    const searchPaths = [
      '.', // Current directory
      '..' // Parent directory
    ];

    for (const basePath of searchPaths) {
      for (const fileName of CONFIG_FILE_NAMES) {
        const fullPath = resolve(basePath, fileName);
        try {
          await fs.access(fullPath);
          return fullPath;
        } catch {
          // File doesn't exist, continue searching
        }
      }
    }

    return null;
  }

  private parseConfigContent(content: string, filePath: string): CoworkConfig {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    try {
      switch (extension) {
        case 'yaml':
        case 'yml':
          return yaml.load(content) as CoworkConfig;
        case 'json':
          return JSON.parse(content) as CoworkConfig;
        default:
          throw new Error(`Unsupported configuration file format: ${extension}`);
      }
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
  }

  private serializeConfig(config: CoworkConfig, filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    try {
      switch (extension) {
        case 'yaml':
        case 'yml':
          return yaml.dump(config, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false
          });
        case 'json':
          return JSON.stringify(config, null, 2);
        default:
          throw new Error(`Unsupported configuration file format: ${extension}`);
      }
    } catch (error) {
      throw new Error(`Failed to serialize configuration: ${error}`);
    }
  }

  private createDefaultConfig(): CoworkConfig {
    return {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      user: {
        organizationStyle: 'by-type',
        riskLevel: 'moderate',
        favoriteActions: [],
        commonlyUsedPaths: [],
        defaultWorkspace: './workspace',
        preferredDateFormat: 'iso',
        timezone: 'UTC',
        language: 'en',
        theme: 'auto',
        notifications: true,
        autoSave: true
      },
      workspace: {
        name: 'Default Workspace',
        description: 'Default workspace configuration',
        rules: {
          fileOrganizations: [
            {
              name: 'Organize by type',
              description: 'Basic file organization by file type',
              pattern: '*',
              destination: '{type}',
              conditions: [
                {
                  type: 'extension',
                  operator: 'equals',
                  value: '.pdf'
                }
              ],
              enabled: true,
              priority: 1
            }
          ],
          namingConventions: [],
          cleanup: [],
          backup: []
        },
        templates: [],
        shortcuts: [],
        automations: []
      },
      system: {
        version: '1.0.0',
        debug: false,
        logLevel: 'info',
        maxConcurrentTasks: 3,
        cacheConfig: {
          enabled: true,
          maxSize: 100,
          ttl: 3600,
          cleanupInterval: 300
        },
        securityConfig: {
          allowExternalCommands: false,
          allowedCommands: [],
          sandboxEnabled: true,
          maxExecutionTime: 300,
          maxMemoryUsage: 512
        },
        performanceConfig: {
          enableProfiling: false,
          enableMetrics: false,
          enableOptimizations: true,
          maxRetries: 3,
          retryDelay: 1000
        }
      },
      ai: {
        enabled: false,
        providers: [],
        defaultProvider: 'openai',
        fallbackToRuleBased: true,
        learningEnabled: true,
        cacheConfig: {
          enabled: true,
          ttl: 3600,
          maxSize: 50
        }
      },
      plugins: []
    };
  }
}

// Singleton instance
export const configManager = new ConfigurationManager();