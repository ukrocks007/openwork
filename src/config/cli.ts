import { configManager } from './manager.js';
import { CoworkConfig, ValidationResult } from './types.js';
import { promises as fs } from 'fs';

export class ConfigCLI {
  async init(configPath?: string): Promise<void> {
    console.log('🔧 Initializing new configuration...');
    
    const defaultConfig = configManager.getDefaults();
    const targetPath = configPath || 'cowork.yaml';
    
    try {
      await configManager.save(defaultConfig, targetPath);
      console.log(`✅ Configuration initialized at: ${targetPath}`);
      console.log('\nNext steps:');
      console.log('1. Edit the configuration file to customize your settings');
      console.log('2. Set up AI providers if you want AI-powered features');
      console.log('3. Define workspace rules for automated organization');
      
    } catch (error) {
      console.error('❌ Failed to initialize configuration:', error);
      throw error;
    }
  }

  async validate(configPath?: string): Promise<void> {
    console.log('🔍 Validating configuration...');
    
    try {
      const config = await configManager.load(configPath);
      const validation = configManager.validate(config);
      
      if (validation.valid) {
        console.log('✅ Configuration is valid');
      } else {
        console.log('❌ Configuration validation failed:');
        validation.errors.forEach(error => console.log(`  - ${error}`));
      }
      
      if (validation.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        validation.warnings.forEach(warning => console.log(`  - ${warning}`));
      }
      
    } catch (error) {
      console.error('❌ Failed to validate configuration:', error);
      throw error;
    }
  }

  async show(configPath?: string): Promise<void> {
    try {
      const config = await configManager.load(configPath);
      this.displayConfig(config);
    } catch (error) {
      console.error('❌ Failed to load configuration:', error);
      throw error;
    }
  }

  async set(key: string, value: string, configPath?: string): Promise<void> {
    try {
      const config = await configManager.load(configPath);
      const updatedConfig = this.setNestedValue(config, key, this.parseValue(value));
      
      await configManager.save(updatedConfig, configPath);
      console.log(`✅ Set ${key} = ${value}`);
      
    } catch (error) {
      console.error(`❌ Failed to set ${key}:`, error);
      throw error;
    }
  }

  async get(key: string, configPath?: string): Promise<void> {
    try {
      const config = await configManager.load(configPath);
      const value = this.getNestedValue(config, key);
      
      if (value !== undefined) {
        console.log(`${key}: ${JSON.stringify(value, null, 2)}`);
      } else {
        console.log(`❌ Key not found: ${key}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to get ${key}:`, error);
      throw error;
    }
  }

  async reset(configPath?: string): Promise<void> {
    console.log('🔄 Resetting configuration to defaults...');
    
    try {
      await configManager.reset();
      console.log('✅ Configuration reset to defaults');
    } catch (error) {
      console.error('❌ Failed to reset configuration:', error);
      throw error;
    }
  }

  async migrate(oldPath: string, newPath: string): Promise<void> {
    console.log(`📦 Migrating configuration from ${oldPath} to ${newPath}...`);
    
    try {
      const config = await configManager.load(oldPath);
      await configManager.save(config, newPath);
      console.log(`✅ Configuration migrated to: ${newPath}`);
      
    } catch (error) {
      console.error('❌ Failed to migrate configuration:', error);
      throw error;
    }
  }

  private displayConfig(config: CoworkConfig): void {
    console.log('📋 Current Configuration:');
    console.log(`\n🔧 System:`);
    console.log(`  Version: ${config.version}`);
    console.log(`  Log Level: ${config.system.logLevel}`);
    console.log(`  Max Concurrent Tasks: ${config.system.maxConcurrentTasks}`);
    console.log(`  Debug Mode: ${config.system.debug}`);
    
    console.log(`\n👤 User Preferences:`);
    console.log(`  Organization Style: ${config.user.organizationStyle}`);
    console.log(`  Risk Level: ${config.user.riskLevel}`);
    console.log(`  Default Workspace: ${config.user.defaultWorkspace}`);
    console.log(`  Language: ${config.user.language}`);
    console.log(`  Theme: ${config.user.theme}`);
    
    console.log(`\n🤖 AI Configuration:`);
    console.log(`  Enabled: ${config.ai.enabled}`);
    if (config.ai.enabled) {
      console.log(`  Default Provider: ${config.ai.defaultProvider}`);
      console.log(`  Providers: ${config.ai.providers.length}`);
      console.log(`  Learning: ${config.ai.learningEnabled}`);
      console.log(`  Fallback: ${config.ai.fallbackToRuleBased}`);
    }
    
    console.log(`\n🏢 Workspace:`);
    console.log(`  Name: ${config.workspace.name}`);
    console.log(`  Organization Rules: ${config.workspace.rules.fileOrganizations.length}`);
    console.log(`  Templates: ${config.workspace.templates.length}`);
    console.log(`  Automations: ${config.workspace.automations.length}`);
    console.log(`  Shortcuts: ${config.workspace.shortcuts.length}`);
    
    if (config.plugins.length > 0) {
      console.log(`\n🔌 Plugins (${config.plugins.length}):`);
      config.plugins.forEach(plugin => {
        console.log(`  - ${plugin.name} v${plugin.version} (${plugin.enabled ? 'enabled' : 'disabled'})`);
      });
    }
  }

  private setNestedValue(obj: any, key: string, value: any): any {
    const keys = key.split('.');
    let current: any = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const currentKey = keys[i];
      if (currentKey !== undefined && !(currentKey in current)) {
        current[currentKey] = {};
      }
      if (currentKey !== undefined) {
        current = current[currentKey];
      }
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey !== undefined) {
      current[lastKey] = value;
    }
    return obj;
  }

  private getNestedValue(obj: any, key: string): any {
    return key.split('.').reduce((current: any, k: string) => current?.[k], obj);
  }

  private parseValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, treat as string
      return value;
    }
  }
}

export const configCLI = new ConfigCLI();