import { TaskPlan, TaskStep, PlannerConfig, AIPlannerRequest, AIPlanningResult } from '../types/index.js';
import { AIPlannerService } from '../ai/planner.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export class EnhancedPlanner {
  private config: PlannerConfig;
  private aiPlanner?: AIPlannerService;
  
  constructor(config: PlannerConfig) {
    this.config = config;
    
    // Initialize AI planner if enabled
    if (config.aiEnabled) {
      const provider = config.aiProvider as 'openai' | 'anthropic' | 'ollama';
      this.aiPlanner = new AIPlannerService({
        provider: provider,
        apiKey: config.aiApiKey,
        model: config.aiModel,
        ollamaBaseUrl: config.ollamaBaseUrl
      });
    }
  }

  async createPlan(goal: string, workspace: string): Promise<TaskPlan> {
    try {
      // Try AI planning first if enabled
      if (this.aiPlanner) {
        const aiPlan = await this.createAIPlan(goal, workspace);
        
        // Validate the AI-generated plan
        const context = await this.analyzeWorkspace(workspace);
        const validation = await this.aiPlanner.validatePlan(aiPlan.plan, context);
        
        if (validation.isValid && validation.confidenceScore > 0.7) {
          return {
            ...aiPlan.plan,
            estimatedDuration: this.estimateDuration(aiPlan.plan.steps)
          };
        } else {
          console.warn(`AI plan validation failed: ${validation.issues.join(', ')}`);
          if (this.config.fallbackToRuleBased !== false) {
            console.log('Falling back to rule-based planning');
            return this.createRuleBasedPlan(goal, workspace);
          }
        }
      }
      
      // Fallback to rule-based planning
      return this.createRuleBasedPlan(goal, workspace);
      
    } catch (error) {
      console.error('Planning failed:', error);
      
      if (this.config.fallbackToRuleBased !== false) {
        return this.createRuleBasedPlan(goal, workspace);
      }
      
      throw error;
    }
  }

  private async createAIPlan(goal: string, workspace: string): Promise<AIPlanningResult> {
    if (!this.aiPlanner) throw new Error('AI planner not initialized');

    const context = await this.analyzeWorkspace(workspace);
    
    const request: AIPlannerRequest = {
      goal,
      workspace,
      context,
      constraints: {
        maxSteps: this.config.maxSteps,
        maxDuration: this.config.timeout,
        allowedOperations: this.config.allowedOperations,
        riskTolerance: 'medium'
      }
    };

    return await this.aiPlanner.generatePlan(request);
  }

  private async createRuleBasedPlan(goal: string, workspace: string): Promise<TaskPlan> {
    const steps = await this.generateSteps(goal, workspace);
    
    return {
      id: this.generateId(),
      goal,
      workspace,
      steps: steps.slice(0, this.config.maxSteps),
      estimatedDuration: this.estimateDuration(steps),
      aiGenerated: false,
      confidence: 0.6
    };
  }

  private async analyzeWorkspace(workspace: string): Promise<any> {
    try {
      const files = await fs.readdir(workspace, { withFileTypes: true });
      const fileTypes = new Set<string>();
      let totalFiles = 0;
      
      for (const file of files) {
        if (file.isFile()) {
          totalFiles++;
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext) fileTypes.add(`.${ext}`);
        }
      }

      return {
        fileTypes: Array.from(fileTypes),
        totalFiles,
        folderStructure: { path: workspace }
      };
    } catch (error) {
      return {
        fileTypes: [],
        totalFiles: 0,
        folderStructure: { path: workspace }
      };
    }
  }

  private async generateSteps(goal: string, workspace: string): Promise<TaskStep[]> {
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
        description: 'Scan workspace directory for files to organize',
        params: { path: workspace },
        requiresConfirmation: false,
        timeout: 5000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'createFolder',
        description: 'Create organized folder structure',
        params: { folders: ['documents', 'images', 'spreadsheets', 'other'] },
        requiresConfirmation: true,
        timeout: 10000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'renameFile',
        description: 'Move files to appropriate folders',
        params: { 
          pattern: '**/*',
          destination: workspace,
          organizeBy: 'extension'
        },
        requiresConfirmation: true,
        timeout: 15000,
        aiGenerated: false
      }
    ];
  }

  private generateExtractionSteps(goal: string, workspace: string): TaskStep[] {
    return [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Read data files for extraction',
        params: { 
          path: workspace,
          extensions: ['.csv', '.json', '.xlsx']
        },
        requiresConfirmation: false,
        timeout: 10000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'extractData',
        description: 'Extract structured data from files',
        params: { 
          format: 'auto',
          outputPath: 'extracted_data.json'
        },
        requiresConfirmation: true,
        timeout: 20000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'generateReport',
        description: 'Create data summary report',
        params: { 
          dataSource: 'extracted_data.json',
          outputPath: 'data_summary.md'
        },
        requiresConfirmation: true,
        timeout: 15000,
        aiGenerated: false
      }
    ];
  }

  private generateReportSteps(goal: string, workspace: string): TaskStep[] {
    return [
      {
        id: this.generateId(),
        type: 'readFiles',
        description: 'Scan workspace for report content',
        params: { path: workspace },
        requiresConfirmation: false,
        timeout: 5000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'extractData',
        description: 'Analyze file contents and structure',
        params: { 
          analysis: 'content',
          outputPath: 'analysis.json'
        },
        requiresConfirmation: true,
        timeout: 15000,
        aiGenerated: false
      },
      {
        id: this.generateId(),
        type: 'generateReport',
        description: 'Generate comprehensive workspace report',
        params: { 
          template: 'workspace_summary',
          outputPath: 'workspace_report.md'
        },
        requiresConfirmation: true,
        timeout: 10000,
        aiGenerated: false
      }
    ];
  }

  private estimateDuration(steps: TaskStep[]): number {
    return steps.reduce((total, step) => {
      return total + (step.timeout || 5000);
    }, 0);
  }

  private generateId(): string {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Learning and improvement methods
  async learnFromExecution(plan: TaskPlan, results: any[]): Promise<void> {
    if (this.aiPlanner && plan.aiGenerated) {
      const success = results.every(r => r.success);
      
      if (success) {
        // @ts-ignore - Access private method for learning
        this.aiPlanner.recordSuccessfulPlan(plan, results);
      } else {
        // @ts-ignore - Access private method for learning  
        this.aiPlanner.recordFailedPlan(plan, results);
      }
    }
  }

  async improvePlan(plan: TaskPlan, results: any[]): Promise<TaskPlan> {
    if (this.aiPlanner && plan.aiGenerated) {
      return await this.aiPlanner.suggestImprovements(plan, results);
    }
    return plan;
  }

  // Configuration methods
  updateConfig(newConfig: Partial<PlannerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
      // Reinitialize AI planner if settings changed
      if (newConfig.aiEnabled !== undefined || newConfig.aiApiKey) {
        if (this.config.aiEnabled && this.config.aiApiKey) {
          const provider = this.config.aiProvider as 'openai' | 'anthropic';
          this.aiPlanner = new AIPlannerService({
            provider: provider,
            apiKey: this.config.aiApiKey,
            model: this.config.aiModel
          });
        } else {
          this.aiPlanner = undefined;
        }
      }
  }

  getConfig(): PlannerConfig {
    return { ...this.config };
  }

  // AI-specific methods
  async isAIAvailable(): Promise<boolean> {
    if (!this.aiPlanner) return false;
    
    try {
      // Test with a simple request
      const testPlan = await this.aiPlanner.generatePlan({
        goal: 'test',
        workspace: '/tmp'
      });
      return testPlan.plan.steps.length > 0;
    } catch {
      return false;
    }
  }

  async getAIRecommendations(goal: string, workspace: string): Promise<string[]> {
    if (!this.aiPlanner) return [];
    
    try {
      const result = await this.aiPlanner.generatePlan({
        goal,
        workspace,
        context: await this.analyzeWorkspace(workspace)
      });
      
      const recommendations: string[] = [];
      
      if (result.confidence < 0.8) {
        recommendations.push('Consider being more specific in your goal');
      }
      
      if (result.warnings && result.warnings.length > 0) {
        recommendations.push(...result.warnings);
      }
      
      return recommendations;
    } catch {
      return [];
    }
  }
}