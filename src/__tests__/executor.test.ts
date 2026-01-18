import * as fs from 'fs/promises';
import * as path from 'path';
import { Executor, ExecutorError } from '../executor';
import { TaskPlan, WorkspaceConfig } from '../types';

describe('Executor', () => {
  let testDir: string;
  let config: WorkspaceConfig;
  let executor: Executor;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), '.test-workspace');
    await fs.mkdir(testDir, { recursive: true });

    config = {
      workingDirectory: testDir,
      allowedPaths: [],
      maxSteps: 50,
      stepTimeout: 5000,
      playwrightEnabled: false,
    };

    executor = new Executor(config);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Path Validation', () => {
    it('should reject paths outside workspace', async () => {
      const plan: TaskPlan = {
        task: 'Read file outside workspace',
        steps: [{ action: 'readFiles', path: '../outside.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.error).toContain('outside allowed workspace');
    });

    it('should accept paths within workspace', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      const plan: TaskPlan = {
        task: 'Read file in workspace',
        steps: [{ action: 'readFiles', path: 'test.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
    });

    it('should respect allowed paths when configured', async () => {
      const allowedDir = path.join(testDir, 'allowed');
      const restrictedDir = path.join(testDir, 'restricted');

      await fs.mkdir(allowedDir, { recursive: true });
      await fs.mkdir(restrictedDir, { recursive: true });

      const restrictedConfig: WorkspaceConfig = {
        ...config,
        allowedPaths: ['allowed'],
      };

      const restrictedExecutor = new Executor(restrictedConfig);

      // Should fail for restricted path
      const plan1: TaskPlan = {
        task: 'Access restricted',
        steps: [{ action: 'createFile', path: 'restricted/file.txt', content: 'test' }],
        requiresConfirmation: true,
      };

      const result1 = await restrictedExecutor.executePlan(plan1);
      expect(result1.success).toBe(false);

      // Should succeed for allowed path
      const plan2: TaskPlan = {
        task: 'Access allowed',
        steps: [{ action: 'createFile', path: 'allowed/file.txt', content: 'test' }],
        requiresConfirmation: true,
      };

      const result2 = await restrictedExecutor.executePlan(plan2);
      expect(result2.success).toBe(true);
    });
  });

  describe('readFiles action', () => {
    it('should read a single file', async () => {
      const testFile = path.join(testDir, 'read-test.txt');
      const content = 'Hello, World!';
      await fs.writeFile(testFile, content);

      const plan: TaskPlan = {
        task: 'Read single file',
        steps: [{ action: 'readFiles', path: 'read-test.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[0].output).toMatchObject({
        content,
      });
    });

    it('should read multiple files from directory', async () => {
      const subDir = path.join(testDir, 'files');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(subDir, 'file2.txt'), 'Content 2');

      const plan: TaskPlan = {
        task: 'Read directory',
        steps: [{ action: 'readFiles', path: 'files' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.steps[0].output)).toBe(true);
      expect((result.steps[0].output as unknown[]).length).toBe(2);
    });

    it('should read files matching pattern', async () => {
      const subDir = path.join(testDir, 'mixed');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, 'file1.txt'), 'Text file');
      await fs.writeFile(path.join(subDir, 'file2.md'), 'Markdown file');
      await fs.writeFile(path.join(subDir, 'file3.txt'), 'Another text file');

      const plan: TaskPlan = {
        task: 'Read txt files',
        steps: [{ action: 'readFiles', path: 'mixed', pattern: '*.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
      const files = result.steps[0].output as Array<{ file: string }>;
      expect(files.length).toBe(2);
      expect(files.every((f) => f.file.endsWith('.txt'))).toBe(true);
    });

    it('should fail for non-existent file', async () => {
      const plan: TaskPlan = {
        task: 'Read non-existent',
        steps: [{ action: 'readFiles', path: 'nonexistent.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.steps[0].success).toBe(false);
    });
  });

  describe('createFile action', () => {
    it('should create a new file', async () => {
      const plan: TaskPlan = {
        task: 'Create file',
        steps: [
          {
            action: 'createFile',
            path: 'new-file.txt',
            content: 'New content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      const filePath = path.join(testDir, 'new-file.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('New content');
    });

    it('should create file in nested directory', async () => {
      const plan: TaskPlan = {
        task: 'Create nested file',
        steps: [
          {
            action: 'createFile',
            path: 'nested/dirs/file.txt',
            content: 'Nested content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      const filePath = path.join(testDir, 'nested/dirs/file.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Nested content');
    });

    it('should fail if file already exists', async () => {
      const testFile = path.join(testDir, 'existing.txt');
      await fs.writeFile(testFile, 'existing');

      const plan: TaskPlan = {
        task: 'Create existing file',
        steps: [
          {
            action: 'createFile',
            path: 'existing.txt',
            content: 'New content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.steps[0].error).toContain('already exists');
    });
  });

  describe('writeFile action', () => {
    it('should write to new file', async () => {
      const plan: TaskPlan = {
        task: 'Write new file',
        steps: [
          {
            action: 'writeFile',
            path: 'write-test.txt',
            content: 'Written content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      const filePath = path.join(testDir, 'write-test.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Written content');
    });

    it('should overwrite existing file', async () => {
      const testFile = path.join(testDir, 'overwrite.txt');
      await fs.writeFile(testFile, 'old content');

      const plan: TaskPlan = {
        task: 'Overwrite file',
        steps: [
          {
            action: 'writeFile',
            path: 'overwrite.txt',
            content: 'new content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('new content');
    });
  });

  describe('moveFile action', () => {
    it('should move a file', async () => {
      const sourcePath = path.join(testDir, 'source.txt');
      await fs.writeFile(sourcePath, 'movable content');

      const plan: TaskPlan = {
        task: 'Move file',
        steps: [
          {
            action: 'moveFile',
            sourcePath: 'source.txt',
            destinationPath: 'destination.txt',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      // Source should not exist
      await expect(fs.access(sourcePath)).rejects.toThrow();

      // Destination should exist with content
      const destPath = path.join(testDir, 'destination.txt');
      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('movable content');
    });

    it('should move file to nested directory', async () => {
      const sourcePath = path.join(testDir, 'source.txt');
      await fs.writeFile(sourcePath, 'content');

      const plan: TaskPlan = {
        task: 'Move to nested',
        steps: [
          {
            action: 'moveFile',
            sourcePath: 'source.txt',
            destinationPath: 'nested/dir/dest.txt',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);

      const destPath = path.join(testDir, 'nested/dir/dest.txt');
      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('content');
    });

    it('should fail if source does not exist', async () => {
      const plan: TaskPlan = {
        task: 'Move non-existent',
        steps: [
          {
            action: 'moveFile',
            sourcePath: 'nonexistent.txt',
            destinationPath: 'dest.txt',
          },
        ],
        requiresConfirmation: true,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
    });
  });

  describe('extractText action', () => {
    it('should extract text after reading files', async () => {
      const testFile = path.join(testDir, 'extract-test.txt');
      await fs.writeFile(testFile, 'Content to extract');

      const plan: TaskPlan = {
        task: 'Extract text',
        steps: [
          { action: 'readFiles', path: 'extract-test.txt' },
          { action: 'extractText', instructions: 'Summarize the content' },
        ],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
      expect(result.steps[1].output).toMatchObject({
        instructions: 'Summarize the content',
      });
    });

    it('should fail if no content has been read', async () => {
      const plan: TaskPlan = {
        task: 'Extract without reading',
        steps: [
          { action: 'extractText', instructions: 'Summarize the content' },
        ],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.steps[0].error).toContain('No content available');
    });
  });

  describe('noop action', () => {
    it('should execute noop successfully', async () => {
      const plan: TaskPlan = {
        task: 'Do nothing',
        steps: [{ action: 'noop', description: 'Just a placeholder' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(true);
      expect(result.steps[0].output).toMatchObject({ action: 'noop' });
    });
  });

  describe('Step limits and timeouts', () => {
    it('should enforce max steps limit', async () => {
      const steps = Array(51)
        .fill(null)
        .map(() => ({ action: 'noop' as const }));

      const plan: TaskPlan = {
        task: 'Too many steps',
        steps,
        requiresConfirmation: false,
      };

      await expect(executor.executePlan(plan)).rejects.toThrow(
        ExecutorError
      );
    });

    it('should fail fast on first error', async () => {
      const plan: TaskPlan = {
        task: 'Fail fast test',
        steps: [
          { action: 'readFiles', path: 'nonexistent.txt' },
          { action: 'noop' }, // Should not be executed
        ],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.success).toBe(false);
      expect(result.steps.length).toBe(1); // Only first step executed
    });
  });

  describe('Execution results', () => {
    it('should include duration for each step', async () => {
      const plan: TaskPlan = {
        task: 'Test timing',
        steps: [{ action: 'noop' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result.steps[0].duration).toBeGreaterThanOrEqual(0);
      expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should return complete execution result', async () => {
      const testFile = path.join(testDir, 'complete-test.txt');
      await fs.writeFile(testFile, 'test');

      const plan: TaskPlan = {
        task: 'Complete test',
        steps: [{ action: 'readFiles', path: 'complete-test.txt' }],
        requiresConfirmation: false,
      };

      const result = await executor.executePlan(plan);
      expect(result).toMatchObject({
        plan,
        success: true,
        totalDuration: expect.any(Number),
      });
      expect(result.steps).toHaveLength(1);
      expect(result.error).toBeUndefined();
    });
  });
});
