import { TaskPlan, TaskStep, PlannerConfig, AIPlannerRequest, AIPlanningResult } from '../types/index.js';
import { AIPlannerService } from '../ai/planner.js';

export class Planner {
  private config: PlannerConfig;
  private aiPlanner?: AIPlannerService;

  constructor(config: PlannerConfig) {
    this.config = config;
    
    // Initialize AI planner if enabled and configured
    if (config.aiEnabled && config.aiProvider && config.aiApiKey) {
      try {
        this.aiPlanner = new AIPlannerService({
          provider: config.aiProvider,
          apiKey: config.aiApiKey,
          model: config.aiModel
        });
        console.log(`🤖 AI Planner initialized with ${config.aiProvider}`);
      } catch (error) {
        console.warn(`⚠️  Failed to initialize AI planner: ${error}`);
        if (!config.fallbackToRuleBased) {
          throw error;
        }
      }
    }
  }

  async createPlan(goal: string, workspace: string): Promise<TaskPlan> {
    // Try AI planning first if available
    if (this.aiPlanner) {
      try {
        console.log('🧠 Using AI to generate intelligent plan...');
        const aiRequest: AIPlannerRequest = {
          goal,
          workspace,
          constraints: {
            maxSteps: this.config.maxSteps,
            maxDuration: this.config.timeout,
            allowedOperations: this.config.allowedOperations,
            riskTolerance: 'medium'
          }
        };
        
        const aiResult: AIPlanningResult = await this.aiPlanner.generatePlan(aiRequest);
        
        // Validate the AI-generated plan
        const context = await this.aiPlanner.analyzeWorkspace?.(workspace) || {
          fileTypes: [],
          totalFiles: 0,
          folderStructure: {}
        };
        
        const validation = await this.aiPlanner.validatePlan(aiResult.plan, context);
        
        if (validation.isValid) {
          console.log(`✅ AI plan generated with ${aiResult.plan.steps.length} steps (confidence: ${aiResult.confidence})`);
          console.log(`🤖 Model: ${aiResult.modelUsed}, Tokens: ${aiResult.tokensUsed}`);
          if (aiResult.warnings?.length) {
            console.log(`⚠️  Warnings: ${aiResult.warnings.join(', ')}`);
          }
          return aiResult.plan;
        } else {
          console.warn(`⚠️  AI plan validation failed: ${validation.issues.join(', ')}`);
          if (!this.config.fallbackToRuleBased) {
            throw new Error('AI plan validation failed and fallback disabled');
          }
        }
      } catch (error) {
        console.warn(`⚠️  AI planning failed: ${error}`);
        if (!this.config.fallbackToRuleBased) {
          throw error;
        }
      }
    }
    
    // Fallback to rule-based planning
    console.log('📋 Using rule-based planning...');
    const steps = await this.generateSteps(goal, workspace);
    
    return {
      id: this.generateId(),
      goal,
      workspace,
      steps: steps.slice(0, this.config.maxSteps),
      estimatedDuration: this.estimateDuration(steps),
      aiGenerated: false
    };
  }

  private async generateSteps(goal: string, workspace: string): Promise<TaskStep[]> {
    // Basic pattern matching for common tasks
    const lowerGoal = goal.toLowerCase();
    
    if (lowerGoal.includes('organize') || lowerGoal.includes('sort')) {
      return this.generateOrganizationSteps(goal, workspace);
    }
    
    if (lowerGoal.includes('extract') || lowerGoal.includes('csv')) {
      return this.generateExtractionSteps(goal, workspace);
    }
    
    if (lowerGoal.includes('report') || lowerGoal.includes('summary')) {
      return this.generateReportSteps(goal, workspace);
    }

    return [];
  }

  private generateOrganizationSteps(goal: string, workspace: string): TaskStep[] {
    return [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Scan workspace directory for files',
        params: { path: workspace },
        requiresConfirmation: false,
        timeout: 30000
      },
      {
        id: this.generateId(),
        type: 'extractData',
        description: 'Analyze file types and content',
        params: { workspace },
        requiresConfirmation: false,
        timeout: 60000
      },
      {
        id: this.generateId(),
        type: 'createFolder',
        description: 'Create organized folder structure',
        params: { folders: ['documents', 'images', 'spreadsheets', 'other'] },
        requiresConfirmation: true,
        timeout: 10000
      }
    ];
  }

  private generateReportSteps(goal: string, workspace: string): TaskStep[] {
    return [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Read source files for report generation',
        params: { path: workspace },
        requiresConfirmation: false,
        timeout: 30000
      },
      {
        id: this.generateId(),
        type: 'generateReport',
        description: 'Generate summary/report from source data',
        params: { goal },
        requiresConfirmation: false,
        timeout: 120000
      },
      {
        id: this.generateId(),
        type: 'writeFile',
        description: 'Save generated report',
        params: { filename: 'generated_report.md' },
        requiresConfirmation: true,
        timeout: 10000
      }
    ];
  }

  private generateExtractionSteps(goal: string, workspace: string): TaskStep[] {
    return [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Scan for data files',
        params: { path: workspace, extensions: ['.csv', '.json', '.txt'] },
        requiresConfirmation: false,
        timeout: 30000
      },
      {
        id: this.generateId(),
        type: 'extractData',
        description: 'Extract structured data from files',
        params: { workspace },
        requiresConfirmation: false,
        timeout: 60000
      },
      {
        id: this.generateId(),
        type: 'writeFile',
        description: 'Export extracted data as CSV',
        params: { filename: 'extracted_data.csv' },
        requiresConfirmation: true,
        timeout: 10000
      }
    ];
  }

  private estimateDuration(steps: TaskStep[]): number {
    return steps.reduce((total, step) => total + (step.timeout || 60000), 0);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}