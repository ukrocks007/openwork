import { promises as fs } from 'fs';
import { join, extname } from 'path';
import NodeCache from 'node-cache';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config as dotenvConfig } from 'dotenv';
import type { 
  AIProvider, 
  AIPlannerRequest, 
  AIPlanningResult, 
  WorkspaceContext, 
  TaskPlan,
  TaskStep,
  ValidationResult,
  AICache,
  LearningData
} from '../types/index.js';

export class AIPlannerService implements AIProvider {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private ollamaBaseUrl?: string;
  private cache: NodeCache;
  private learningData: LearningData;

  constructor(config?: { provider: 'openai' | 'anthropic' | 'ollama'; apiKey?: string; model?: string; ollamaBaseUrl?: string }) {
    // Load environment variables
    dotenvConfig();
    
    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
    this.learningData = {
      successfulPlans: [],
      failedPlans: [],
      userCorrections: [],
      performanceMetrics: []
    };

    // Use provided config or fallback to environment variables
    const provider = config?.provider || (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'ollama') || 'openai';
    const apiKey = config?.apiKey || process.env.AI_API_KEY || '';
    const model = config?.model || process.env.AI_MODEL;
    const ollamaBaseUrl = config?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (provider === 'openai' && apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else if (provider === 'anthropic' && apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    } else if (provider === 'ollama') {
      this.ollamaBaseUrl = ollamaBaseUrl;
      // Ollama doesn't require API key for local setup
    }
  }

  async generatePlan(request: AIPlannerRequest): Promise<AIPlanningResult> {
    const cacheKey = this.generateCacheKey(request);
    const cached = await this.cache.get<TaskPlan>(cacheKey);
    if (cached) {
      return {
        plan: cached,
        confidence: 0.9,
        reasoning: "Retrieved from cache based on similar previous request",
        modelUsed: "cache",
        tokensUsed: 0
      };
    }

    const context = request.context || await this.analyzeWorkspace(request.workspace);
    const prompt = this.buildPlanningPrompt(request, context);

    let result: AIPlanningResult;
    
    try {
      if (this.openai) {
        result = await this.generateWithOpenAI(prompt, request);
      } else if (this.anthropic) {
        result = await this.generateWithAnthropic(prompt, request);
      } else if (this.ollamaBaseUrl) {
        result = await this.generateWithOllama(prompt, request);
      } else {
        throw new Error('No AI provider configured');
      }

      // Cache the result
      await this.cache.set(cacheKey, result.plan);
      
      return result;
    } catch (error) {
      // Fallback to rule-based planning
      return this.generateFallbackPlan(request, error as Error);
    }
  }

  async validatePlan(plan: TaskPlan, context: WorkspaceContext): Promise<ValidationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidenceScore = 1.0;

    // Validate steps against workspace reality
    for (const step of plan.steps) {
      if (step.type === 'readFiles' && step.params.extensions) {
        const hasMatchingFiles = context.fileTypes.some(ext => 
          step.params.extensions.includes(ext)
        );
        if (!hasMatchingFiles) {
          issues.push(`Step "${step.description}" targets file types not found in workspace`);
          confidenceScore -= 0.1;
        }
      }

      if (step.type === 'renameFile' && step.params.source) {
        // Check if source file exists
        if (!await this.fileExists(join(plan.workspace, step.params.source))) {
          issues.push(`Step "${step.description}" references non-existent file: ${step.params.source}`);
          confidenceScore -= 0.2;
        }
      }
    }

    // Check for dangerous operations
    const destructiveSteps = plan.steps.filter(step => 
      step.type === 'renameFile' || step.type === 'writeFile'
    );
    if (destructiveSteps.length > plan.steps.length * 0.5) {
      suggestions.push('Consider using dry-run mode first due to many destructive operations');
      confidenceScore -= 0.1;
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
      confidenceScore: Math.max(0, confidenceScore)
    };
  }

  async suggestImprovements(plan: TaskPlan, results: any[]): Promise<TaskPlan> {
    const failedSteps = results.filter(r => !r.success);
    if (failedSteps.length === 0) {
      return plan;
    }

    const improvements = await this.analyzeFailures(plan, failedSteps);
    return this.applyImprovements(plan, improvements);
  }

  async analyzeWorkspace(workspace: string): Promise<WorkspaceContext> {
    try {
      const files = await this.scanDirectory(workspace);
      const fileTypes = [...new Set(files.map(f => extname(f)))];
      
      const folderStructure = await this.buildFolderStructure(workspace);
      
      return {
        fileTypes,
        totalFiles: files.length,
        folderStructure
      };
    } catch (error) {
      return {
        fileTypes: [],
        totalFiles: 0,
        folderStructure: {}
      };
    }
  }

  private async scanDirectory(dir: string, files: string[] = []): Promise<string[]> {
    try {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = await fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          await this.scanDirectory(fullPath, files);
        } else {
          files.push(fullPath);
        }
      }
      
      return files;
    } catch (error) {
      return files;
    }
  }

  private async buildFolderStructure(dir: string): Promise<Record<string, any>> {
    // Simplified folder structure analysis
    return { path: dir };
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private buildPlanningPrompt(request: AIPlannerRequest, context: WorkspaceContext): string {
    return `
You are an intelligent task planning assistant. Help me create a detailed execution plan for the following task:

GOAL: ${request.goal}

WORKSPACE CONTEXT:
- Total files: ${context.totalFiles}
- File types found: ${context.fileTypes.join(', ')}
- Folder structure: ${JSON.stringify(context.folderStructure, null, 2)}

CONSTRAINTS:
- Maximum steps: ${request.constraints?.maxSteps || 20}
- Maximum duration: ${request.constraints?.maxDuration || 300} seconds
- Allowed operations: ${request.constraints?.allowedOperations?.join(', ') || 'all'}
- Risk tolerance: ${request.constraints?.riskTolerance || 'medium'}

Available step types:
- readFiles: Read files with optional filtering
- writeFile: Write content to a file
- createFolder: Create directory structure
- renameFile: Move or rename files
- extractData: Extract structured data from files
- generateReport: Create summary reports

Please generate a JSON response with:
1. A sequence of steps to achieve the goal
2. Each step should include: type, description, parameters, requiresConfirmation, timeout
3. Reasoning for the chosen approach
4. Confidence score (0-1)
5. Any warnings or alternative approaches

Format your response as valid JSON:
{
  "plan": {
    "steps": [
      {
        "type": "step_type",
        "description": "What this step does",
        "params": { ... },
        "requiresConfirmation": true/false,
        "timeout": 5000
      }
    ]
  },
  "reasoning": "Explanation of the approach",
  "confidence": 0.9,
  "warnings": ["Any warnings"],
  "alternatives": []
}
`;
  }

  private async generateWithOpenAI(prompt: string, request: AIPlannerRequest): Promise<AIPlanningResult> {
    if (!this.openai) throw new Error('OpenAI not configured');

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenAI');

    try {
      const parsed = JSON.parse(content);
      return {
        plan: this.convertToTaskPlan(parsed.plan, request),
        confidence: parsed.confidence || 0.8,
        reasoning: parsed.reasoning || 'Generated by OpenAI',
        warnings: parsed.warnings || [],
        modelUsed: 'gpt-4',
        tokensUsed: completion.usage?.total_tokens || 0
      };
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${error}`);
    }
  }

  private async generateWithOllama(prompt: string, request: AIPlannerRequest): Promise<AIPlanningResult> {
    if (!this.ollamaBaseUrl) throw new Error('Ollama not configured');

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen2.5:0.5b', // Use the model that's available
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1500,
          }
        })
      });
      
      console.log(`🔗 Ollama Request: ${this.ollamaBaseUrl}/api/generate`);
      console.log(`🎯 Model: ${process.env.OLLAMA_MODEL || 'llama2'}`);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.response;

      if (!content) throw new Error('No response from Ollama');

      try {
        const parsed = JSON.parse(content);
        return {
          plan: this.convertToTaskPlan(parsed.plan, request),
          confidence: parsed.confidence || 0.7, // Slightly lower confidence for local models
          reasoning: parsed.reasoning || 'Generated by Ollama',
          warnings: parsed.warnings || [],
          modelUsed: process.env.OLLAMA_MODEL || 'llama2',
          tokensUsed: data.eval_count || 0
        };
      } catch (error) {
        // If JSON parsing fails, try to extract plan from free-form text
        const fallbackPlan = this.createFallbackPlanFromText(content, request);
        return {
          plan: fallbackPlan,
          confidence: 0.6,
          reasoning: 'Generated by Ollama (text fallback)',
          warnings: ['Could not parse structured response from Ollama'],
          modelUsed: process.env.OLLAMA_MODEL || 'llama2',
          tokensUsed: data.eval_count || 0
        };
      }
    } catch (error) {
      console.warn(`Ollama API failed: ${error}. Falling back to OpenAI if available.`);
      
      // Try fallback to OpenAI if available
      if (this.openai) {
        return await this.generateWithOpenAI(prompt, request);
      }
      
      throw error;
    }
  }

  private createFallbackPlanFromText(text: string, request: AIPlannerRequest): TaskPlan {
    // Create a basic plan from free-form text response
    const steps: TaskStep[] = [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Read and analyze files in workspace',
        params: { path: request.workspace },
        requiresConfirmation: false,
        timeout: 5000,
        aiGenerated: true
      },
      {
        id: this.generateId(),
        type: 'generateReport',
        description: 'Generate analysis report based on AI insights',
        params: { outputPath: 'ollama_analysis.md' },
        requiresConfirmation: true,
        timeout: 10000,
        aiGenerated: true
      }
    ];

    return {
      id: this.generateId(),
      goal: request.goal,
      workspace: request.workspace,
      steps,
      aiGenerated: true,
      confidence: 0.6
    };
  }

  private async generateWithAnthropic(prompt: string, request: AIPlannerRequest): Promise<AIPlanningResult> {
    if (!this.anthropic) throw new Error('Anthropic not configured');

    try {
      // For the older version of Anthropic SDK (0.9.1), use completions API
      const response = await (this.anthropic as any).completions.create({
        model: 'claude-2.1',
        max_tokens_to_sample: 2000,
        temperature: 0.3,
        prompt: `Human: ${prompt}\n\nAssistant:`
      });

      const content = response.completion;
      if (!content) throw new Error('No response from Anthropic');

      try {
        const parsed = JSON.parse(content);
        return {
          plan: this.convertToTaskPlan(parsed.plan, request),
          confidence: parsed.confidence || 0.8,
          reasoning: parsed.reasoning || 'Generated by Anthropic Claude',
          warnings: parsed.warnings || [],
          modelUsed: 'claude-2.1',
          tokensUsed: 0  // Usage info not available in older API
        };
      } catch (error) {
        throw new Error(`Failed to parse Anthropic response: ${error}`);
      }
    } catch (error) {
      console.warn(`Anthropic API failed: ${error}. Falling back to OpenAI if available.`);
      
      // Try fallback to OpenAI if available
      if (this.openai) {
        return await this.generateWithOpenAI(prompt, request);
      }
      
      throw error;
    }
  }

  private convertToTaskPlan(aiPlan: any, request: AIPlannerRequest): TaskPlan {
    return {
      id: this.generateId(),
      goal: request.goal,
      workspace: request.workspace,
      steps: aiPlan.steps.map((step: any) => ({
        ...step,
        id: this.generateId(),
        aiGenerated: true,
        confidence: step.confidence || 0.8,
        reasoning: step.reasoning
      })),
      aiGenerated: true,
      confidence: aiPlan.confidence || 0.8
    };
  }

  private generateFallbackPlan(request: AIPlannerRequest, error: Error): AIPlanningResult {
    // Simple rule-based fallback
    const fallbackSteps: TaskStep[] = [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Read all files in workspace',
        params: { extensions: ['*'] },
        requiresConfirmation: false,
        timeout: 5000
      },
      {
        id: this.generateId(),
        type: 'generateReport',
        description: 'Generate basic summary report',
        params: { outputPath: 'summary.md' },
        requiresConfirmation: true,
        timeout: 10000
      }
    ];

    const plan: TaskPlan = {
      id: this.generateId(),
      goal: request.goal,
      workspace: request.workspace,
      steps: fallbackSteps,
      aiGenerated: false,
      confidence: 0.5
    };

    return {
      plan,
      confidence: 0.5,
      reasoning: `AI planning failed (${error.message}). Using rule-based fallback.`,
      warnings: ['Using simplified fallback plan due to AI unavailability'],
      modelUsed: 'rule-based',
      tokensUsed: 0
    };
  }

  private async analyzeFailures(plan: TaskPlan, failedSteps: any[]): Promise<any[]> {
    // Simple failure analysis - in real implementation, this would be more sophisticated
    return failedSteps.map(step => ({
      stepId: step.stepId,
      suggestion: 'Increase timeout or check file permissions'
    }));
  }

  private applyImprovements(plan: TaskPlan, improvements: any[]): TaskPlan {
    // Apply simple improvements like increasing timeouts
    const improvedSteps = plan.steps.map(step => {
      const improvement = improvements.find(imp => imp.stepId === step.id);
      if (improvement && improvement.suggestion.includes('timeout')) {
        return { ...step, timeout: (step.timeout || 5000) * 2 };
      }
      return step;
    });

    return { ...plan, steps: improvedSteps };
  }

  private generateCacheKey(request: AIPlannerRequest): string {
    // Create a cache key based on goal and workspace
    return `${request.goal}:${request.workspace}:${JSON.stringify(request.constraints)}`;
  }

  private generateId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Learning data methods
  recordSuccessfulPlan(plan: TaskPlan, results: any[]): void {
    this.learningData.successfulPlans.push(plan);
    this.learningData.performanceMetrics.push({
      plan,
      executionTime: results.reduce((sum, r) => sum + r.duration, 0),
      success: true
    });
  }

  recordFailedPlan(plan: TaskPlan, results: any[]): void {
    this.learningData.failedPlans.push(plan);
    this.learningData.performanceMetrics.push({
      plan,
      executionTime: results.reduce((sum, r) => sum + r.duration, 0),
      success: false
    });
  }

  recordUserCorrection(original: TaskPlan, corrected: TaskPlan): void {
    this.learningData.userCorrections.push({ original, corrected });
  }
}