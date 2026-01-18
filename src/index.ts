#!/usr/bin/env node

import { Planner } from './planner/index.js';
import { Executor } from './executor/index.js';
import { TaskSummary, ExecutionContext, PlannerConfig } from './types/index.js';
import { configManager } from './config/manager.js';
import { CoworkConfig } from './config/types.js';
import { join, resolve } from 'path';
import { config } from 'dotenv';

class CoworkLite {
  private planner!: Planner;
  private executor!: Executor;
  private coworkConfig!: CoworkConfig;

  constructor() {
    // Load environment variables
    config();
    
    // Initialize with defaults first, then load configuration
    this.coworkConfig = configManager.getDefaults();
    this.loadConfiguration();
  }

  private async loadConfiguration(): Promise<void> {
    try {
      this.coworkConfig = await configManager.load();
      console.log(`✅ Configuration loaded: ${configManager.getConfigPath() || 'defaults'}`);
    } catch (error) {
      console.warn(`⚠️  Using default configuration: ${error}`);
      this.coworkConfig = configManager.getDefaults();
    }

    // Create planner configuration from system config and environment
    const aiProvider = this.coworkConfig.ai.providers.find(p => p.name === this.coworkConfig.ai.defaultProvider);
    const plannerConfig: PlannerConfig = {
      maxSteps: this.coworkConfig.system.maxConcurrentTasks * 5, // Reasonable step limit
      timeout: this.coworkConfig.system.securityConfig.maxExecutionTime * 1000,
      allowedOperations: this.coworkConfig.system.securityConfig.allowedCommands.length > 0 
        ? this.coworkConfig.system.securityConfig.allowedCommands 
        : ['readFiles', 'writeFile', 'createFolder', 'extractData', 'generateReport'],
      aiEnabled: this.coworkConfig.ai.enabled,
      aiProvider: aiProvider?.type === 'openai' || aiProvider?.type === 'anthropic' ? aiProvider.type : 'openai',
      aiApiKey: aiProvider?.apiKey || process.env.AI_API_KEY,
      aiModel: aiProvider?.model || 'gpt-4',
      aiTemperature: 0.3,
      fallbackToRuleBased: this.coworkConfig.ai.fallbackToRuleBased
    };
    
    this.planner = new Planner(plannerConfig);
    this.executor = new Executor();
  }

  async run(goal: string, workspace: string, options: { dryRun?: boolean } = {}): Promise<TaskSummary> {
    const workspacePath = resolve(workspace);
    
    console.log(`🎯 Goal: ${goal}`);
    console.log(`📁 Workspace: ${workspacePath}`);
    console.log(`🔧 Mode: ${options.dryRun ? 'Dry Run' : 'Execute'}\\n`);

    // Create plan
    console.log('📋 Creating task plan...');
    const plan = await this.planner.createPlan(goal, workspacePath);
    
    console.log(`Plan created with ${plan.steps.length} steps:`);
    plan.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.description} (${step.type})`);
    });

    if (plan.steps.length === 0) {
      return {
        planId: plan.id,
        goal,
        totalSteps: 0,
        completedSteps: 0,
        status: 'completed',
        results: []
      };
    }

    // Execute plan
    const context: ExecutionContext = {
      workspace: workspacePath,
      dryRun: options.dryRun || false,
      logs: [],
      confirmedSteps: new Set()
    };

    console.log('\\n🚀 Executing plan...');
    const results = [];

    for (const step of plan.steps) {
      console.log(`\\n⏳ ${step.description}`);
      const result = await this.executor.executeStep(step, context);
      results.push(result);

      if (!result.success) {
        console.log(`❌ Failed: ${result.error}`);
        break;
      }
    }

    const completedSteps = results.filter(r => r.success).length;
    const status = completedSteps === plan.steps.length ? 'completed' : 
                   completedSteps > 0 ? 'failed' : 'failed';

    console.log(`\\n📊 Task Summary:`);
    console.log(`  Total steps: ${plan.steps.length}`);
    console.log(`  Completed: ${completedSteps}`);
    console.log(`  Status: ${status}`);

    return {
      planId: plan.id,
      goal,
      totalSteps: plan.steps.length,
      completedSteps,
      status,
      results
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: cowork-lite "goal" "workspace-path" [--dry-run]');
    console.log('Example: cowork-lite "Organize receipts folder" ./receipts');
    process.exit(1);
  }

  const goal = args[0] || '';
  const workspace = args[1] || '';
  const dryRun = args.includes('--dry-run');

  const cowork = new CoworkLite();
  
  try {
    await cowork.run(goal, workspace, { dryRun });
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main();
}

export { CoworkLite };