#!/usr/bin/env node

import { EnhancedPlanner } from './planner/enhanced.js';
import { Executor } from './executor/index.js';
import { TaskSummary, ExecutionContext, PlannerConfig } from './types/index.js';
import { join, resolve } from 'path';
import { config } from 'dotenv';
import { configManager } from './config/manager.js';
import { CoworkConfig } from './config/types.js';

// Load environment variables
config();

class EnhancedCoworkLite {
  private planner: EnhancedPlanner;
  private executor: Executor;

  constructor() {
    // Load from environment variables
    const plannerConfig: PlannerConfig = {
      maxSteps: parseInt(process.env.MAX_STEPS || '20'),
      timeout: parseInt(process.env.TIMEOUT || '300000'),
      allowedOperations: (process.env.ALLOWED_OPERATIONS || 'readFiles,writeFile,createFolder,renameFile,extractData,generateReport').split(','),
      aiEnabled: process.env.AI_ENABLED === 'true',
      aiProvider: (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'ollama') || 'openai',
      aiApiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
      aiModel: process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5:0.5b',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      aiTemperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
      fallbackToRuleBased: process.env.FALLBACK_TO_RULE_BASED !== 'false'
    };
    
    this.planner = new EnhancedPlanner(plannerConfig);
    this.executor = new Executor();
  }

  // Note: Configuration file loading can be added in a future enhancement
  // For now using environment variables which are already working well

  async run(goal: string, workspace: string, options: { 
    dryRun?: boolean; 
    force?: boolean;
    verbose?: boolean;
    aiRecommendations?: boolean;
  } = {}): Promise<TaskSummary> {
    const workspacePath = resolve(workspace);
    
    console.log(`🎯 Goal: ${goal}`);
    console.log(`📁 Workspace: ${workspacePath}`);
    console.log(`🔧 Mode: ${options.dryRun ? 'Dry Run' : 'Execute'}`);
    
    if (options.verbose) {
      const config = this.planner.getConfig();
      console.log(`🤖 AI Enabled: ${config.aiEnabled ? 'Yes' : 'No'}`);
      if (config.aiEnabled) {
        console.log(`🧠 AI Provider: ${config.aiProvider}`);
        console.log(`🔑 API Key Configured: ${config.aiApiKey ? 'Yes' : 'No'}`);
      }
    }
    
    console.log('');

    // Show AI recommendations if requested
    if (options.aiRecommendations) {
      console.log('💡 Getting AI recommendations...');
      const recommendations = await this.planner.getAIRecommendations(goal, workspacePath);
      if (recommendations.length > 0) {
        console.log('📝 Recommendations:');
        recommendations.forEach((rec: string, index: number) => {
          console.log(`  ${index + 1}. ${rec}`);
        });
        console.log('');
      }
    }

    // Create plan
    console.log('📋 Creating task plan...');
    const plan = await this.planner.createPlan(goal, workspacePath);
    
    console.log(`✅ Plan created with ${plan.steps.length} steps${plan.aiGenerated ? ' (AI-powered)' : ''}`);
    if (plan.aiGenerated && plan.confidence) {
      console.log(`🎯 Confidence: ${(plan.confidence * 100).toFixed(1)}%`);
      if (plan.modelUsed) {
        console.log(`🤖 Model: ${plan.modelUsed}`);
      }
    }
    
    console.log('\\n📝 Plan Details:');
    plan.steps.forEach((step: any, index: number) => {
      const confidence = step.confidence ? ` (${(step.confidence * 100).toFixed(0)}% confidence)` : '';
      console.log(`  ${index + 1}. ${step.description} (${step.type})${confidence}`);
      if (options.verbose && step.reasoning) {
        console.log(`     💭 Reasoning: ${step.reasoning}`);
      }
      if (options.verbose && step.requiresConfirmation) {
        console.log(`     ⚠️  Requires confirmation`);
      }
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

    // Ask for confirmation unless forced or dry-run
    if (!options.dryRun && !options.force) {
      console.log('\\n❓ Do you want to proceed with this plan? (y/N)');
      const answer = await this.promptUser();
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Cancelled by user');
        process.exit(0);
      }
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
    let failedSteps = 0;

    for (const step of plan.steps) {
      console.log(`\\n⏳ ${step.description}`);
      
      if (options.verbose) {
        console.log(`     🔧 Parameters: ${JSON.stringify(step.params, null, 2)}`);
      }
      
      const result = await this.executor.executeStep(step, context);
      results.push(result);

      if (result.success) {
        console.log(`✅ Completed in ${result.duration}ms`);
        if (result.output && options.verbose) {
          console.log(`     📤 Output: ${JSON.stringify(result.output).substring(0, 200)}...`);
        }
      } else {
        console.log(`❌ Failed: ${result.error}`);
        failedSteps++;
        
        if (!options.force) {
          console.log('⚠️  Stopping due to failure. Use --force to continue despite errors.');
          break;
        }
      }
    }

    const completedSteps = results.filter(r => r.success).length;
    const status = completedSteps === plan.steps.length ? 'completed' : 
                   completedSteps > 0 ? 'failed' : 'failed';

    console.log(`\\n📊 Task Summary:`);
    console.log(`  Total steps: ${plan.steps.length}`);
    console.log(`  Completed: ${completedSteps}`);
    console.log(`  Failed: ${failedSteps}`);
    console.log(`  Status: ${status}`);
    
    if (plan.aiGenerated && completedSteps === plan.steps.length) {
      console.log('\\n🎓 Learning from successful execution...');
      await this.planner.learnFromExecution(plan, results);
    }

    return {
      planId: plan.id,
      goal,
      totalSteps: plan.steps.length,
      completedSteps,
      status,
      results
    };
  }

  async getConfiguration(): Promise<void> {
    const config = this.planner.getConfig();
    const aiAvailable = await this.planner.isAIAvailable();
    
    console.log('⚙️  Current Configuration:');
    console.log(`  Max Steps: ${config.maxSteps}`);
    console.log(`  Timeout: ${config.timeout}ms`);
    console.log(`  Allowed Operations: ${config.allowedOperations.join(', ')}`);
    console.log(`  AI Enabled: ${config.aiEnabled}`);
    console.log(`  AI Available: ${aiAvailable}`);
    console.log(`  AI Provider: ${config.aiProvider || 'Not configured'}`);
    console.log(`  AI Model: ${config.aiModel || 'Not configured'}`);
    console.log(`  API Key: ${config.aiApiKey ? 'Configured' : 'Not configured'}`);
    console.log(`  Fallback to Rule-Based: ${config.fallbackToRuleBased}`);
  }

  async testAI(): Promise<void> {
    console.log('🧪 Testing AI integration...');
    
    const config = this.planner.getConfig();
    if (!config.aiEnabled) {
      console.log('❌ AI is not enabled. Set AI_ENABLED=true in environment.');
      return;
    }

    const aiAvailable = await this.planner.isAIAvailable();
    if (!aiAvailable) {
      console.log('❌ AI is not available. Check API key and network connection.');
      return;
    }

    console.log('✅ AI is available and working!');
    console.log('🤖 Testing plan generation...');
    
    try {
      const testPlan = await this.planner.createPlan('organize test files', '/tmp');
      console.log(`✅ AI generated plan with ${testPlan.steps.length} steps`);
      console.log(`🎯 Confidence: ${testPlan.confidence ? (testPlan.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`🔑 Model used: ${testPlan.modelUsed || 'Rule-based'}`);
    } catch (error) {
      console.log(`❌ AI test failed: ${error}`);
    }
  }

  private async promptUser(): Promise<string> {
    process.stdin.setRawMode?.(true);
    
    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        process.stdin.setRawMode?.(false);
        resolve(data.toString().trim());
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        process.stdin.setRawMode?.(false);
        resolve('');
      }, 30000);
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('🚀 Cowork Lite - AI-Powered Task Automation\\n');
    console.log('Usage: cowork-lite "goal" "workspace-path" [options]');
    console.log('\\nCommands:');
    console.log('  cowork-lite "goal" "path"           Execute a task');
    console.log('  cowork-lite --config                 Show configuration');
    console.log('  cowork-lite --test-ai               Test AI integration');
    console.log('  cowork-lite --help                   Show this help');
    console.log('\\nOptions:');
    console.log('  --dry-run                         Preview actions without executing');
    console.log('  --force                           Continue despite errors');
    console.log('  --verbose                         Show detailed output');
    console.log('  --ai-recommendations              Get AI suggestions before planning');
    console.log('\\nExamples:');
    console.log('  cowork-lite "Organize receipts" ./receipts');
    console.log('  cowork-lite "Generate report" ./workspace --dry-run');
    console.log('  cowork-lite "Extract data" ./data --verbose --ai-recommendations');
    console.log('\\nEnvironment Variables:');
    console.log('  AI_ENABLED=true                    Enable AI features');
    console.log('  OPENAI_API_KEY=your_key           OpenAI API key');
    console.log('  ANTHROPIC_API_KEY=your_key         Anthropic API key');
    console.log('  AI_PROVIDER=openai                  Choose AI provider');
    console.log('  MAX_STEPS=20                      Maximum steps per plan');
    process.exit(1);
  }

  if (args[0] === '--help') {
    await main();
    return;
  }

  const cowork = new EnhancedCoworkLite();
  
  try {
    if (args[0] === '--config') {
      await cowork.getConfiguration();
      return;
    }

    if (args[0] === '--test-ai') {
      await cowork.testAI();
      return;
    }

    if (args.length < 2) {
      console.log('❌ Error: Goal and workspace path are required');
      console.log('Run "cowork-lite --help" for usage information');
      process.exit(1);
    }

    const goal = args[0] || '';
    const workspace = args[1] || '';
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const verbose = args.includes('--verbose');
    const aiRecommendations = args.includes('--ai-recommendations');

    await cowork.run(goal, workspace, { dryRun, force, verbose, aiRecommendations });
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (process.env.DEBUG) {
      console.error('Stack trace:', error instanceof Error ? error.stack : error);
    }
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main();
}

export { EnhancedCoworkLite };