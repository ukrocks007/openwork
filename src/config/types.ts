export interface UserPreferences {
  organizationStyle: 'by-type' | 'by-date' | 'by-project' | 'custom';
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  favoriteActions: string[];
  commonlyUsedPaths: string[];
  defaultWorkspace?: string;
  preferredDateFormat: 'iso' | 'us' | 'eu';
  timezone: string;
  language: string;
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  autoSave: boolean;
}

export interface WorkspaceConfig {
  name: string;
  description?: string;
  rules: WorkspaceRules;
  templates: TemplateConfig[];
  shortcuts: ShortcutConfig[];
  automations: AutomationConfig[];
}

export interface WorkspaceRules {
  fileOrganizations: FileOrganizationRule[];
  namingConventions: NamingConvention[];
  cleanup: CleanupRule[];
  backup: BackupRule[];
}

export interface FileOrganizationRule {
  name: string;
  description: string;
  pattern: string | RegExp;
  destination: string;
  conditions: RuleCondition[];
  enabled: boolean;
  priority: number;
}

export interface RuleCondition {
  type: 'extension' | 'size' | 'name' | 'date' | 'content' | 'tag';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'regex';
  value: string | number | RegExp;
}

export interface NamingConvention {
  name: string;
  pattern: string;
  description: string;
  example: string;
  appliesTo: string[];
}

export interface CleanupRule {
  name: string;
  description: string;
  target: string;
  condition: RuleCondition;
  action: 'delete' | 'archive' | 'move' | 'compress';
  schedule?: string; // cron-like expression
  enabled: boolean;
}

export interface BackupRule {
  name: string;
  source: string;
  destination: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  retention: number; // days
  compression: boolean;
  encryption: boolean;
}

export interface TemplateConfig {
  name: string;
  description: string;
  steps: TemplateStep[];
  variables: TemplateVariable[];
}

export interface TemplateStep {
  type: string;
  description: string;
  params: Record<string, any>;
  conditions?: TemplateCondition[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'directory';
  description: string;
  default?: any;
  required: boolean;
}

export interface TemplateCondition {
  type: string;
  operator: string;
  value: any;
}

export interface ShortcutConfig {
  name: string;
  description: string;
  command: string;
  shortcut?: string;
  parameters: Record<string, any>;
}

export interface AutomationConfig {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
}

export interface AutomationTrigger {
  type: 'schedule' | 'file_change' | 'system_event' | 'manual';
  value: string | Record<string, any>;
}

export interface AutomationAction {
  type: string;
  params: Record<string, any>;
  delay?: number;
}

export interface SystemConfig {
  version: string;
  debug: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  maxConcurrentTasks: number;
  cacheConfig: CacheConfig;
  securityConfig: SecurityConfig;
  performanceConfig: PerformanceConfig;
}

export interface CacheConfig {
  enabled: boolean;
  maxSize: number; // MB
  ttl: number; // seconds
  cleanupInterval: number; // seconds
}

export interface SecurityConfig {
  allowExternalCommands: boolean;
  allowedCommands: string[];
  sandboxEnabled: boolean;
  maxExecutionTime: number; // seconds
  maxMemoryUsage: number; // MB
}

export interface PerformanceConfig {
  enableProfiling: boolean;
  enableMetrics: boolean;
  metricsEndpoint?: string;
  enableOptimizations: boolean;
  maxRetries: number;
  retryDelay: number; // milliseconds
}

export interface CoworkConfig {
  version: string;
  created: string;
  lastModified: string;
  user: UserPreferences;
  workspace: WorkspaceConfig;
  system: SystemConfig;
  ai: AIConfig;
  plugins: PluginConfig[];
}

export interface AIConfig {
  enabled: boolean;
  providers: AIProviderConfig[];
  defaultProvider: string;
  fallbackToRuleBased: boolean;
  learningEnabled: boolean;
  cacheConfig: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export interface AIProviderConfig {
  name: string;
  type: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  model?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface PluginConfig {
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, any>;
  permissions: string[];
}

export interface ConfigManager {
  load(configPath?: string): Promise<CoworkConfig>;
  save(config: CoworkConfig, configPath?: string): Promise<void>;
  validate(config: CoworkConfig): ValidationResult;
  merge(base: CoworkConfig, override: Partial<CoworkConfig>): CoworkConfig;
  getDefaults(): CoworkConfig;
  reset(): Promise<void>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration file formats
export const CONFIG_FILE_NAMES = [
  'cowork.yaml',
  'cowork.yml', 
  'cowork.json',
  '.coworkrc',
  '.coworkrc.json',
  '.coworkrc.yaml',
  '.coworkrc.yml'
] as const;

export type ConfigFileName = typeof CONFIG_FILE_NAMES[number];