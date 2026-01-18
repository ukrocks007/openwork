import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Executor } from '../src/executor/index';
import { SafetyLayer } from '../src/safety/index';
import type { TaskStep, ExecutionContext } from '../src/types/index';
import { TestWorkspace } from './utils';

describe('Executor', () => {
  let executor: Executor;
  let mockSafety: jest.Mocked<SafetyLayer>;
  let workspace: TestWorkspace;

  beforeEach(async () => {
    executor = new Executor();
    workspace = new TestWorkspace();
    await workspace.setup();

    // Mock safety layer
    mockSafety = {
      checkStep: jest.fn().mockReturnValue({
        isDestructive: false,
        riskLevel: 'low' as const,
        warnings: [],
        requiresConfirmation: false
      }),
      requestConfirmation: jest.fn().mockImplementation(async (step: any) => true as boolean),
      createDryRunLog: jest.fn().mockReturnValue('[DRY RUN] test')
    } as any;
  });

  afterEach(async () => {
    await workspace.cleanup();
    jest.restoreAllMocks();
  });

  describe('executeStep', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = {
        workspace: workspace.getPath(),
        dryRun: false,
        logs: [],
        confirmedSteps: new Set()
      };
    });

    it('should execute readFiles step successfully', async () => {
      await workspace.createFile('test.txt', 'test content');
      
      const step: TaskStep = {
        id: 'read-1',
        type: 'readFiles',
        description: 'Read files from workspace',
        params: { path: '.' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.stepId).toBe('read-1');
      expect(result.output.files).toBeDefined();
      expect(result.output.files).toHaveLength(1);
      expect(result.output.files[0].name).toBe('test.txt');
      expect(context.logs).toContain('✅ Read files from workspace');
    });

    it('should filter files by extensions when specified', async () => {
      await workspace.createFile('file.txt', 'content');
      await workspace.createFile('file.js', 'code');
      await workspace.createFile('file.csv', 'data');

      const step: TaskStep = {
        id: 'read-2',
        type: 'readFiles',
        description: 'Read specific file types',
        params: { path: '.', extensions: ['.txt', '.csv'] }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.output.files).toHaveLength(2);
      expect(result.output.files.map((f: any) => f.name).sort()).toEqual(['file.csv', 'file.txt']);
    });

    it('should execute writeFile step successfully', async () => {
      const step: TaskStep = {
        id: 'write-1',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'output.txt', content: 'Hello World' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.output.filePath).toContain('output.txt');
      expect(result.output.bytesWritten).toBe(11);
      expect(await workspace.exists('output.txt')).toBe(true);
      expect(await workspace.readFile('output.txt')).toBe('Hello World');
    });

    it('should execute createFolder step successfully', async () => {
      const step: TaskStep = {
        id: 'create-1',
        type: 'createFolder',
        description: 'Create folders',
        params: { folders: ['docs', 'images', 'temp'] }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.output.createdFolders).toHaveLength(3);
      expect(await workspace.exists('docs')).toBe(true);
      expect(await workspace.exists('images')).toBe(true);
      expect(await workspace.exists('temp')).toBe(true);
    });

    it('should execute extractData step successfully', async () => {
      const step: TaskStep = {
        id: 'extract-1',
        type: 'extractData',
        description: 'Extract data',
        params: { workspace: workspace.getPath() }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.output.extractedData).toBeDefined();
      expect(result.output.summary).toBe('Data extraction completed');
    });

    it('should execute generateReport step successfully', async () => {
      const step: TaskStep = {
        id: 'report-1',
        type: 'generateReport',
        description: 'Generate report',
        params: { goal: 'Test report generation' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(true);
      expect(result.output.content).toContain('Test report generation');
      expect(result.output.title).toBe('Generated Report');
      expect(result.output.format).toBe('markdown');
    });

    it('should handle dry-run mode correctly', async () => {
      const step: TaskStep = {
        id: 'dry-1',
        type: 'writeFile',
        description: 'Write file in dry run',
        params: { filename: 'should-not-exist.txt', content: 'test' }
      };

      const dryRunContext: ExecutionContext = {
        ...context,
        dryRun: true
      };

      const result = await executor.executeStep(step, dryRunContext);

      expect(result.success).toBe(true);
      expect(await workspace.exists('should-not-exist.txt')).toBe(false);
    });

    it('should handle confirmation rejection', async () => {
      // Mock safety layer to reject confirmation
      const rejectingSafety = new SafetyLayer();
      jest.spyOn(rejectingSafety, 'requestConfirmation').mockResolvedValue(false);
      jest.spyOn(rejectingSafety, 'checkStep').mockReturnValue({
        isDestructive: true,
        riskLevel: 'high' as const,
        warnings: ['Test warning'],
        requiresConfirmation: true
      });

      const executorWithMock = new Executor();
      (executorWithMock as any).safety = rejectingSafety;

      const step: TaskStep = {
        id: 'reject-1',
        type: 'writeFile',
        description: 'Write file requiring confirmation',
        params: { filename: 'rejected.txt', content: 'test' }
      };

      const result = await executorWithMock.executeStep(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User cancelled the operation');
      expect(await workspace.exists('rejected.txt')).toBe(false);
    });

    it('should handle unknown step types', async () => {
      const step: TaskStep = {
        id: 'unknown-1',
        type: 'unknownType' as any,
        description: 'Unknown operation',
        params: {}
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown step type: unknownType');
    });

    it('should handle file system errors gracefully', async () => {
      const step: TaskStep = {
        id: 'error-1',
        type: 'readFiles',
        description: 'Read from non-existent directory',
        params: { path: '/non/existent/path' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(context.logs.some(log => log.includes('❌'))).toBe(true);
    });

    it('should measure execution duration', async () => {
      const step: TaskStep = {
        id: 'timing-1',
        type: 'readFiles',
        description: 'Test timing',
        params: { path: '.' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Error Handling', () => {
    let context: ExecutionContext;

    beforeEach(() => {
      context = {
        workspace: workspace.getPath(),
        dryRun: false,
        logs: [],
        confirmedSteps: new Set()
      };
    });

    it('should log errors for failed steps', async () => {
      const step: TaskStep = {
        id: 'error-2',
        type: 'readFiles',
        description: 'Failing operation',
        params: { path: '/invalid/path' }
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(false);
      expect(context.logs.some(log => log.includes('❌'))).toBe(true);
      expect(context.logs.some(log => log.includes('Failing operation'))).toBe(true);
    });

    it('should handle malformed parameters gracefully', async () => {
      const step: TaskStep = {
        id: 'malformed-1',
        type: 'writeFile',
        description: 'Malformed parameters',
        params: null as any
      };

      const result = await executor.executeStep(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Integration with Safety Layer', () => {
    it('should use safety layer for destructive operations', async () => {
      const executor = new Executor();
      
      // Get the internal safety layer instance and spy on its methods
      const safetyLayer = (executor as any).safety;
      const requestConfirmationSpy = jest.spyOn(safetyLayer, 'requestConfirmation');
      requestConfirmationSpy.mockResolvedValue(true);

      const context: ExecutionContext = {
        workspace: workspace.getPath(),
        dryRun: false,
        logs: [],
        confirmedSteps: new Set()
      };

      const step: TaskStep = {
        id: 'safe-1',
        type: 'writeFile',
        description: 'Destructive operation',
        params: { filename: 'safe-write.txt', content: 'test' }
      };

      await executor.executeStep(step, context);

      expect(requestConfirmationSpy).toHaveBeenCalledWith(step);
    });
  });
});