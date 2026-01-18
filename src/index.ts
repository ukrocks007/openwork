#!/usr/bin/env node
import * as readline from 'readline';
import * as path from 'path';
import { Planner } from './planner';
import { Executor } from './executor';
import { getLogger, LogLevel } from './logger';
import { TaskPlan, WorkspaceConfig } from './types';

/**
 * Simple CLI for Cowork-Lite
 * A full Ink-based TUI will be added in future iterations
 */

const BANNER = `
█████  Cowork-Lite v0.1.0
Local AI coworker · deterministic · open-source
Model: qwen2.5:0.5b (Ollama)
──────────────────────────────────────────────────
`;

async function main() {
  console.clear();
  console.log(BANNER);

  const workingDir = process.argv[2] || process.cwd();
  console.log(`Working Directory: ${path.resolve(workingDir)}\n`);

  // Initialize logger
  const logger = getLogger({
    logToConsole: false,
    minLevel: LogLevel.INFO,
  });

  // Initialize planner
  const planner = new Planner(
    {
      model: 'qwen2.5:0.5b',
      temperature: 0.2,
      maxTokens: 1024,
    },
    logger
  );

  // Check Ollama availability
  console.log('Checking Ollama connection...');
  const isAvailable = await planner.checkAvailability();

  if (!isAvailable) {
    console.error(
      '❌ Error: Cannot connect to Ollama. Please ensure Ollama is running.'
    );
    console.error('   Start Ollama with: ollama serve');
    process.exit(1);
  }

  console.log('✓ Ollama is available');

  // Check model availability
  const hasModel = await planner.checkModel();
  if (!hasModel) {
    console.warn(
      `⚠ Warning: Model qwen2.5:0.5b not found. Please pull it with:`
    );
    console.warn('   ollama pull qwen2.5:0.5b\n');
    process.exit(1);
  }

  console.log('✓ Model qwen2.5:0.5b is available\n');

  // Initialize executor
  const workspaceConfig: WorkspaceConfig = {
    workingDirectory: path.resolve(workingDir),
    allowedPaths: [],
    maxSteps: 50,
    stepTimeout: 30000,
    playwrightEnabled: false,
  };

  const executor = new Executor(workspaceConfig);

  // Main loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  let continueLoop = true;

  while (continueLoop) {
    console.log('▶ Describe what you want to get done (or "exit" to quit):');
    const userTask = await askQuestion('> ');

    if (!userTask.trim() || userTask.trim().toLowerCase() === 'exit') {
      continueLoop = false;
      break;
    }

    try {
      // Planning
      console.log('\n⏳ Planning...');
      const plan: TaskPlan = await planner.generatePlan(userTask);

      console.log('\n📋 Generated Plan:');
      console.log(`Task: ${plan.task}`);
      console.log(`Steps: ${plan.steps.length}`);
      plan.steps.forEach((step, i) => {
        const details =
          'path' in step && step.path
            ? ` (${step.path})`
            : 'sourcePath' in step
            ? ` (${step.sourcePath} → ${step.destinationPath})`
            : '';
        console.log(`  ${i + 1}. ${step.action}${details}`);
      });

      // Confirmation if needed
      if (plan.requiresConfirmation) {
        console.log(
          '\n⚠ This plan contains destructive actions (create/write/move files)'
        );
        const confirm = await askQuestion('Proceed? (y/n): ');

        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
          console.log('❌ Plan cancelled.\n');
          continue;
        }
      }

      // Execution
      console.log('\n▶ Executing plan...');
      const result = await executor.executePlan(plan);

      if (result.success) {
        console.log(
          `\n✓ Execution completed successfully in ${result.totalDuration}ms`
        );
        console.log(`  ${result.steps.length} steps executed`);

        const logFile = logger.getLogFile();
        if (logFile) {
          console.log(`  Log file: ${logFile}`);
        }
      } else {
        console.error(`\n❌ Execution failed: ${result.error}`);

        // Show which step failed
        const failedStep = result.steps.find((s) => !s.success);
        if (failedStep) {
          console.error(
            `  Failed at step ${failedStep.stepIndex + 1}: ${failedStep.error}`
          );
        }
      }

      await logger.flush();
    } catch (error) {
      console.error(
        `\n❌ Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log('\n');
  }

  rl.close();
  console.log('\nGoodbye!');
  process.exit(0);
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
