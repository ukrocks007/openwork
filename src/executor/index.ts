import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import {
  TaskPlan,
  Action,
  StepResult,
  ExecutionResult,
  WorkspaceConfig,
} from '../types';

export class ExecutorError extends Error {
  constructor(message: string, public stepIndex?: number) {
    super(message);
    this.name = 'ExecutorError';
  }
}

export class Executor {
  private context: Map<string, unknown> = new Map();

  constructor(private config: WorkspaceConfig) {}

  /**
   * Check if a path is within allowed workspace boundaries
   */
  private isPathAllowed(targetPath: string): boolean {
    const resolvedPath = path.resolve(this.config.workingDirectory, targetPath);

    // Check if path is within working directory
    if (!resolvedPath.startsWith(this.config.workingDirectory)) {
      return false;
    }

    // Check against allowed paths if specified
    if (this.config.allowedPaths.length > 0) {
      return this.config.allowedPaths.some((allowedPath) => {
        const resolvedAllowed = path.resolve(
          this.config.workingDirectory,
          allowedPath
        );
        return resolvedPath.startsWith(resolvedAllowed);
      });
    }

    return true;
  }

  /**
   * Validate path is within workspace
   */
  private validatePath(targetPath: string): string {
    const resolvedPath = path.resolve(this.config.workingDirectory, targetPath);

    if (!this.isPathAllowed(targetPath)) {
      throw new ExecutorError(
        `Path "${targetPath}" is outside allowed workspace boundaries`
      );
    }

    return resolvedPath;
  }

  /**
   * Execute readFiles action
   */
  private async executeReadFiles(
    action: Extract<Action, { action: 'readFiles' }>
  ): Promise<unknown> {
    const resolvedPath = this.validatePath(action.path);

    // Check if it's a file or directory
    const stats = await fs.stat(resolvedPath);

    if (stats.isFile()) {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      this.context.set('lastReadContent', content);
      return { file: resolvedPath, content };
    }

    // It's a directory - read files with optional pattern
    const pattern = action.pattern || '*';
    const searchPattern = path.join(resolvedPath, pattern);
    const files = await glob(searchPattern, { nodir: true });

    const filesContent = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(file, 'utf-8');
        return { file, content };
      })
    );

    this.context.set('lastReadContent', filesContent);
    return filesContent;
  }

  /**
   * Execute createFile action
   */
  private async executeCreateFile(
    action: Extract<Action, { action: 'createFile' }>
  ): Promise<unknown> {
    const resolvedPath = this.validatePath(action.path);

    // Check if file already exists
    try {
      await fs.access(resolvedPath);
      throw new ExecutorError(`File already exists: ${action.path}`);
    } catch (error) {
      // File doesn't exist, proceed with creation
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });

    // Create file
    await fs.writeFile(resolvedPath, action.content, 'utf-8');

    return { path: resolvedPath, bytesWritten: action.content.length };
  }

  /**
   * Execute writeFile action
   */
  private async executeWriteFile(
    action: Extract<Action, { action: 'writeFile' }>
  ): Promise<unknown> {
    const resolvedPath = this.validatePath(action.path);

    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file (overwrites if exists)
    await fs.writeFile(resolvedPath, action.content, 'utf-8');

    return { path: resolvedPath, bytesWritten: action.content.length };
  }

  /**
   * Execute moveFile action
   */
  private async executeMoveFile(
    action: Extract<Action, { action: 'moveFile' }>
  ): Promise<unknown> {
    const sourcePath = this.validatePath(action.sourcePath);
    const destPath = this.validatePath(action.destinationPath);

    // Check source exists
    await fs.access(sourcePath);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    // Move file
    await fs.rename(sourcePath, destPath);

    return { from: sourcePath, to: destPath };
  }

  /**
   * Execute extractText action (simplified - just returns stored content)
   */
  private async executeExtractText(
    action: Extract<Action, { action: 'extractText' }>
  ): Promise<unknown> {
    const lastContent = this.context.get('lastReadContent');

    if (!lastContent) {
      throw new ExecutorError(
        'No content available to extract from. Run readFiles first.'
      );
    }

    // In a real implementation, this would use the LLM to extract/summarize
    // For now, we just return the content with the instructions
    return {
      instructions: action.instructions,
      content: lastContent,
      note: 'Text extraction would be done by LLM in full implementation',
    };
  }

  /**
   * Execute noop action
   */
  private async executeNoop(
    action: Extract<Action, { action: 'noop' }>
  ): Promise<unknown> {
    return { action: 'noop', description: action.description };
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: Action): Promise<unknown> {
    switch (action.action) {
      case 'readFiles':
        return this.executeReadFiles(action);
      case 'createFile':
        return this.executeCreateFile(action);
      case 'writeFile':
        return this.executeWriteFile(action);
      case 'moveFile':
        return this.executeMoveFile(action);
      case 'extractText':
        return this.executeExtractText(action);
      case 'noop':
        return this.executeNoop(action);
      case 'runPlaywrightTask':
        if (!this.config.playwrightEnabled) {
          throw new ExecutorError('Playwright tasks are not enabled');
        }
        throw new ExecutorError('Playwright tasks not yet implemented');
      default:
        throw new ExecutorError(`Unknown action type: ${(action as Action).action}`);
    }
  }

  /**
   * Execute a single step with timeout
   */
  private async executeStep(
    action: Action,
    stepIndex: number
  ): Promise<StepResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new ExecutorError(`Step ${stepIndex} timed out`, stepIndex));
        }, this.config.stepTimeout);
      });

      const output = await Promise.race([
        this.executeAction(action),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      return {
        stepIndex,
        action: action.action,
        success: true,
        output,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        stepIndex,
        action: action.action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  /**
   * Execute a complete task plan
   */
  async executePlan(plan: TaskPlan): Promise<ExecutionResult> {
    // Validate step count
    if (plan.steps.length > this.config.maxSteps) {
      throw new ExecutorError(
        `Plan exceeds maximum steps (${this.config.maxSteps})`
      );
    }

    const startTime = Date.now();
    const results: StepResult[] = [];

    // Reset context
    this.context.clear();

    // Execute steps sequentially
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const result = await this.executeStep(step, i);
      results.push(result);

      // Fail fast on error
      if (!result.success) {
        const totalDuration = Date.now() - startTime;
        return {
          plan,
          steps: results,
          success: false,
          totalDuration,
          error: `Step ${i} failed: ${result.error}`,
        };
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      plan,
      steps: results,
      success: true,
      totalDuration,
    };
  }
}
