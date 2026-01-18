export interface TaskStep {
  id: string;
  type: 'readFiles' | 'writeFile' | 'renameFile' | 'createFolder' | 'extractData' | 'generateReport' | 'browserAction';
  description: string;
  params: Record<string, any>;
  requiresConfirmation?: boolean;
  timeout?: number;
  aiGenerated?: boolean;
  confidence?: number;
  reasoning?: string;
}

export interface TaskPlan {
  id: string;
  goal: string;
  workspace: string;
  steps: TaskStep[];
  estimatedDuration?: number;
  aiGenerated?: boolean;
  modelUsed?: string;
  confidence?: number;
  alternativePlans?: TaskPlan[];
}

export interface ExecutionContext {
  workspace: string;
  dryRun: boolean;
  logs: string[];
  confirmedSteps: Set<string>;
}

export interface SafetyCheck {
  isDestructive: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
  requiresConfirmation: boolean;
}

export interface PlannerConfig {
  maxSteps: number;
  timeout: number;
  allowedOperations: string[];
  aiEnabled?: boolean;
  aiProvider?: 'openai' | 'anthropic' | 'ollama';
  aiModel?: string;
  aiApiKey?: string;
  aiTemperature?: number;
  fallbackToRuleBased?: boolean;
  ollamaBaseUrl?: string;
}

export interface ExecutorResult {
  stepId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}

export interface TaskSummary {
  planId: string;
  goal: string;
  totalSteps: number;
  completedSteps: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  results: ExecutorResult[];
}

// AI Integration Types
export interface AIPlannerRequest {
  goal: string;
  workspace: string;
  context?: WorkspaceContext;
  previousAttempts?: TaskPlan[];
  constraints?: PlanningConstraints;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface WorkspaceContext {
  fileTypes: string[];
  totalFiles: number;
  folderStructure: Record<string, any>;
  recentActivity?: string[];
  userPreferences?: UserPreferences;
}

export interface PlanningConstraints {
  maxSteps?: number;
  maxDuration?: number;
  allowedOperations?: string[];
  riskTolerance?: 'low' | 'medium' | 'high';
  dryRunPreferred?: boolean;
}

export interface UserPreferences {
  favoriteActions: string[];
  commonlyUsedPaths: string[];
  organizationStyle: 'by-type' | 'by-date' | 'by-project' | 'custom';
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface AIPlanningResult {
  plan: TaskPlan;
  confidence: number;
  reasoning: string;
  alternatives?: TaskPlan[];
  warnings?: string[];
  modelUsed: string;
  tokensUsed: number;
}

export interface AIProvider {
  generatePlan(request: AIPlannerRequest): Promise<AIPlanningResult>;
  validatePlan(plan: TaskPlan, context: WorkspaceContext): Promise<ValidationResult>;
  suggestImprovements(plan: TaskPlan, results: ExecutorResult[]): Promise<TaskPlan>;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  confidenceScore: number;
}

export interface AICache {
  get(key: string): Promise<TaskPlan | null>;
  set(key: string, plan: TaskPlan, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

export interface LearningData {
  successfulPlans: TaskPlan[];
  failedPlans: TaskPlan[];
  userCorrections: Array<{ original: TaskPlan, corrected: TaskPlan }>;
  performanceMetrics: Array<{ plan: TaskPlan, executionTime: number, success: boolean }>;
}