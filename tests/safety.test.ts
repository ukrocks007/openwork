import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SafetyLayer } from '../src/safety/index';
import type { TaskStep } from '../src/types/index';

describe('SafetyLayer', () => {
  let safetyLayer: SafetyLayer;

  beforeEach(() => {
    safetyLayer = new SafetyLayer();
    // Mock console for confirmation tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('checkStep', () => {
    it('should mark readFiles as low risk and non-destructive', () => {
      const step: TaskStep = {
        id: 'test-1',
        type: 'readFiles',
        description: 'Read files from directory',
        params: { path: '/test' }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(false);
      expect(check.riskLevel).toBe('low');
      expect(check.requiresConfirmation).toBe(false);
      expect(check.warnings).toHaveLength(0);
    });

    it('should mark writeFile as high risk and destructive', () => {
      const step: TaskStep = {
        id: 'test-2',
        type: 'writeFile',
        description: 'Write file to disk',
        params: { filename: 'test.txt' }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(true);
      expect(check.riskLevel).toBe('high');
      expect(check.requiresConfirmation).toBe(true);
      expect(check.warnings).toContain('This will create or overwrite a file');
    });

    it('should mark createFolder as medium risk and destructive', () => {
      const step: TaskStep = {
        id: 'test-3',
        type: 'createFolder',
        description: 'Create directory',
        params: { folders: ['test'] }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(true);
      expect(check.riskLevel).toBe('medium');
      expect(check.requiresConfirmation).toBe(true);
      expect(check.warnings).toContain('This will create a new directory');
    });

    it('should mark renameFile as high risk and destructive', () => {
      const step: TaskStep = {
        id: 'test-4',
        type: 'renameFile',
        description: 'Rename file',
        params: { oldName: 'old.txt', newName: 'new.txt' }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(true);
      expect(check.riskLevel).toBe('high');
      expect(check.requiresConfirmation).toBe(true);
      expect(check.warnings).toContain('This will rename a file');
    });

    it('should mark extractData as low risk and non-destructive', () => {
      const step: TaskStep = {
        id: 'test-5',
        type: 'extractData',
        description: 'Extract data from files',
        params: { workspace: '/test' }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(false);
      expect(check.riskLevel).toBe('low');
      expect(check.requiresConfirmation).toBe(false);
      expect(check.warnings).toHaveLength(0);
    });

    it('should mark generateReport as medium risk', () => {
      const step: TaskStep = {
        id: 'test-6',
        type: 'generateReport',
        description: 'Generate report',
        params: { goal: 'test' }
      };

      const check = safetyLayer.checkStep(step);

      expect(check.isDestructive).toBe(false);
      expect(check.riskLevel).toBe('medium');
      expect(check.requiresConfirmation).toBe(false);
      expect(check.warnings).toHaveLength(0);
    });

    it('should respect explicit requiresConfirmation setting', () => {
      const step: TaskStep = {
        id: 'test-7',
        type: 'readFiles',
        description: 'Read files requiring confirmation',
        params: { path: '/test' },
        requiresConfirmation: true
      };

      const check = safetyLayer.checkStep(step);

      expect(check.requiresConfirmation).toBe(true);
    });
  });

  describe('requestConfirmation', () => {
    beforeEach(() => {
      // Mock console.log to capture output
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should return true for non-destructive steps', async () => {
      const step: TaskStep = {
        id: 'test-8',
        type: 'readFiles',
        description: 'Read files',
        params: { path: '/test' }
      };

      const confirmed = await safetyLayer.requestConfirmation(step);

      expect(confirmed).toBe(true);
    });

    it('should return true for destructive steps with user approval', async () => {
      const step: TaskStep = {
        id: 'test-9',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'test.txt' }
      };

      const confirmed = await safetyLayer.requestConfirmation(step);

      expect(confirmed).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️  Step requires confirmation'));
    });

    it('should return true in test environment without prompting', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const step: TaskStep = {
        id: 'test-10',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'test.txt' }
      };

      const confirmed = await safetyLayer.requestConfirmation(step);

      expect(confirmed).toBe(true);

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('createDryRunLog', () => {
    it('should create appropriate dry-run log message', () => {
      const step: TaskStep = {
        id: 'test-11',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'test.txt' }
      };

      const logMessage = safetyLayer.createDryRunLog(step);

      expect(logMessage).toBe('[DRY RUN] writeFile: Write file (Risk: high)');
    });

    it('should include correct risk level for different step types', () => {
      const lowRiskStep: TaskStep = {
        id: 'test-12',
        type: 'readFiles',
        description: 'Read files',
        params: { path: '/test' }
      };

      const highRiskStep: TaskStep = {
        id: 'test-13',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'test.txt' }
      };

      const lowRiskLog = safetyLayer.createDryRunLog(lowRiskStep);
      const highRiskLog = safetyLayer.createDryRunLog(highRiskStep);

      expect(lowRiskLog).toContain('Risk: low');
      expect(highRiskLog).toContain('Risk: high');
    });
  });

  describe('Warning Generation', () => {
    it('should generate appropriate warnings for different step types', () => {
      const writeFileStep: TaskStep = {
        id: 'test-14',
        type: 'writeFile',
        description: 'Write file',
        params: { filename: 'test.txt' }
      };

      const renameFileStep: TaskStep = {
        id: 'test-15',
        type: 'renameFile',
        description: 'Rename file',
        params: { oldName: 'old.txt', newName: 'new.txt' }
      };

      const writeFileCheck = safetyLayer.checkStep(writeFileStep);
      const renameFileCheck = safetyLayer.checkStep(renameFileStep);

      expect(writeFileCheck.warnings).toContain('This will create or overwrite a file');
      expect(renameFileCheck.warnings).toContain('This will rename a file');
    });

    it('should generate no warnings for non-destructive steps', () => {
      const readFilesStep: TaskStep = {
        id: 'test-16',
        type: 'readFiles',
        description: 'Read files',
        params: { path: '/test' }
      };

      const check = safetyLayer.checkStep(readFilesStep);

      expect(check.warnings).toHaveLength(0);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess risk levels correctly for all step types', () => {
      const testCases: Array<[TaskStep, string]> = [
        [
          { id: '1', type: 'readFiles', description: 'Read', params: {} },
          'low'
        ],
        [
          { id: '2', type: 'extractData', description: 'Extract', params: {} },
          'low'
        ],
        [
          { id: '3', type: 'generateReport', description: 'Generate', params: {} },
          'medium'
        ],
        [
          { id: '4', type: 'createFolder', description: 'Create', params: {} },
          'medium'
        ],
        [
          { id: '5', type: 'writeFile', description: 'Write', params: {} },
          'high'
        ],
        [
          { id: '6', type: 'renameFile', description: 'Rename', params: {} },
          'high'
        ]
      ];

      testCases.forEach(([step, expectedRisk]) => {
        const check = safetyLayer.checkStep(step);
        expect(check.riskLevel).toBe(expectedRisk);
      });
    });
  });
});