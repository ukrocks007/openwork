import {
  validatePlan,
  validateTaskPlan,
  isDestructiveAction,
  validateConfirmationFlag,
  validateStepLimits,
  PlanValidationError,
} from '../planner/validator';
import { TaskPlan, Action } from '../types';

describe('Plan Validator', () => {
  describe('validatePlan', () => {
    it('should validate a correct task plan', () => {
      const plan = {
        task: 'Read and summarize files',
        steps: [
          { action: 'readFiles', path: './notes' },
          { action: 'extractText', instructions: 'Summarize the content' },
        ],
        requiresConfirmation: false,
      };

      const result = validatePlan(plan);
      expect(result).toEqual(plan);
    });

    it('should reject plan with missing task field', () => {
      const plan = {
        steps: [{ action: 'readFiles', path: './notes' }],
        requiresConfirmation: false,
      };

      expect(() => validatePlan(plan)).toThrow(PlanValidationError);
    });

    it('should reject plan with empty task string', () => {
      const plan = {
        task: '',
        steps: [{ action: 'readFiles', path: './notes' }],
        requiresConfirmation: false,
      };

      expect(() => validatePlan(plan)).toThrow(PlanValidationError);
    });

    it('should reject plan with empty steps array', () => {
      const plan = {
        task: 'Do something',
        steps: [],
        requiresConfirmation: false,
      };

      expect(() => validatePlan(plan)).toThrow(PlanValidationError);
    });

    it('should reject plan with invalid action type', () => {
      const plan = {
        task: 'Do something',
        steps: [{ action: 'invalidAction', path: './notes' }],
        requiresConfirmation: false,
      };

      expect(() => validatePlan(plan)).toThrow(PlanValidationError);
    });

    it('should validate readFiles action', () => {
      const plan = {
        task: 'Read files',
        steps: [
          {
            action: 'readFiles',
            path: './notes',
            pattern: '*.md',
            description: 'Read markdown files',
          },
        ],
        requiresConfirmation: false,
      };

      const result = validatePlan(plan);
      expect(result.steps[0]).toEqual(plan.steps[0]);
    });

    it('should validate createFile action', () => {
      const plan = {
        task: 'Create file',
        steps: [
          {
            action: 'createFile',
            path: './output.txt',
            content: 'Hello World',
          },
        ],
        requiresConfirmation: true,
      };

      const result = validatePlan(plan);
      expect(result.steps[0]).toMatchObject({
        action: 'createFile',
        path: './output.txt',
        content: 'Hello World',
      });
    });

    it('should validate writeFile action', () => {
      const plan = {
        task: 'Write file',
        steps: [
          {
            action: 'writeFile',
            path: './output.txt',
            content: 'Updated content',
          },
        ],
        requiresConfirmation: true,
      };

      const result = validatePlan(plan);
      expect(result.steps[0]).toMatchObject({
        action: 'writeFile',
        path: './output.txt',
      });
    });

    it('should validate moveFile action', () => {
      const plan = {
        task: 'Move file',
        steps: [
          {
            action: 'moveFile',
            sourcePath: './old.txt',
            destinationPath: './new.txt',
          },
        ],
        requiresConfirmation: true,
      };

      const result = validatePlan(plan);
      expect(result.steps[0]).toMatchObject({
        action: 'moveFile',
        sourcePath: './old.txt',
        destinationPath: './new.txt',
      });
    });

    it('should validate extractText action', () => {
      const plan = {
        task: 'Extract text',
        steps: [
          {
            action: 'extractText',
            instructions: 'Summarize the main points',
          },
        ],
        requiresConfirmation: false,
      };

      const result = validatePlan(plan);
      expect(result.steps[0]).toMatchObject({
        action: 'extractText',
        instructions: 'Summarize the main points',
      });
    });

    it('should validate noop action', () => {
      const plan = {
        task: 'Do nothing',
        steps: [{ action: 'noop', description: 'Placeholder' }],
        requiresConfirmation: false,
      };

      const result = validatePlan(plan);
      expect(result.steps[0].action).toBe('noop');
    });
  });

  describe('isDestructiveAction', () => {
    it('should identify writeFile as destructive', () => {
      const action: Action = {
        action: 'writeFile',
        path: './test.txt',
        content: 'test',
      };
      expect(isDestructiveAction(action)).toBe(true);
    });

    it('should identify createFile as destructive', () => {
      const action: Action = {
        action: 'createFile',
        path: './test.txt',
        content: 'test',
      };
      expect(isDestructiveAction(action)).toBe(true);
    });

    it('should identify moveFile as destructive', () => {
      const action: Action = {
        action: 'moveFile',
        sourcePath: './old.txt',
        destinationPath: './new.txt',
      };
      expect(isDestructiveAction(action)).toBe(true);
    });

    it('should not identify readFiles as destructive', () => {
      const action: Action = { action: 'readFiles', path: './test.txt' };
      expect(isDestructiveAction(action)).toBe(false);
    });

    it('should not identify extractText as destructive', () => {
      const action: Action = {
        action: 'extractText',
        instructions: 'Summarize',
      };
      expect(isDestructiveAction(action)).toBe(false);
    });

    it('should not identify noop as destructive', () => {
      const action: Action = { action: 'noop' };
      expect(isDestructiveAction(action)).toBe(false);
    });
  });

  describe('validateConfirmationFlag', () => {
    it('should validate correct confirmation flag for destructive actions', () => {
      const plan: TaskPlan = {
        task: 'Write file',
        steps: [
          { action: 'writeFile', path: './test.txt', content: 'test' },
        ],
        requiresConfirmation: true,
      };
      expect(validateConfirmationFlag(plan)).toBe(true);
    });

    it('should validate correct confirmation flag for non-destructive actions', () => {
      const plan: TaskPlan = {
        task: 'Read files',
        steps: [{ action: 'readFiles', path: './test.txt' }],
        requiresConfirmation: false,
      };
      expect(validateConfirmationFlag(plan)).toBe(true);
    });

    it('should reject incorrect confirmation flag for destructive actions', () => {
      const plan: TaskPlan = {
        task: 'Write file',
        steps: [
          { action: 'writeFile', path: './test.txt', content: 'test' },
        ],
        requiresConfirmation: false,
      };
      expect(validateConfirmationFlag(plan)).toBe(false);
    });

    it('should reject incorrect confirmation flag for non-destructive actions', () => {
      const plan: TaskPlan = {
        task: 'Read files',
        steps: [{ action: 'readFiles', path: './test.txt' }],
        requiresConfirmation: true,
      };
      expect(validateConfirmationFlag(plan)).toBe(false);
    });
  });

  describe('validateStepLimits', () => {
    it('should accept plan within step limit', () => {
      const plan: TaskPlan = {
        task: 'Multiple steps',
        steps: [
          { action: 'readFiles', path: './test1.txt' },
          { action: 'readFiles', path: './test2.txt' },
        ],
        requiresConfirmation: false,
      };
      expect(validateStepLimits(plan, 50)).toBe(true);
    });

    it('should accept plan at step limit', () => {
      const plan: TaskPlan = {
        task: 'Multiple steps',
        steps: [
          { action: 'readFiles', path: './test1.txt' },
          { action: 'readFiles', path: './test2.txt' },
        ],
        requiresConfirmation: false,
      };
      expect(validateStepLimits(plan, 2)).toBe(true);
    });

    it('should reject plan exceeding step limit', () => {
      const plan: TaskPlan = {
        task: 'Multiple steps',
        steps: [
          { action: 'readFiles', path: './test1.txt' },
          { action: 'readFiles', path: './test2.txt' },
          { action: 'readFiles', path: './test3.txt' },
        ],
        requiresConfirmation: false,
      };
      expect(validateStepLimits(plan, 2)).toBe(false);
    });
  });

  describe('validateTaskPlan', () => {
    it('should validate a complete correct plan', () => {
      const plan = {
        task: 'Process files',
        steps: [
          { action: 'readFiles', path: './input' },
          { action: 'extractText', instructions: 'Get summary' },
          { action: 'createFile', path: './output.txt', content: 'Result' },
        ],
        requiresConfirmation: true,
      };

      const result = validateTaskPlan(plan);
      expect(result).toEqual(plan);
    });

    it('should reject plan exceeding step limit', () => {
      const steps = Array(51)
        .fill(null)
        .map((_, i) => ({ action: 'readFiles' as const, path: `./file${i}` }));

      const plan = {
        task: 'Too many steps',
        steps,
        requiresConfirmation: false,
      };

      expect(() => validateTaskPlan(plan, 50)).toThrow(PlanValidationError);
      expect(() => validateTaskPlan(plan, 50)).toThrow(
        /maximum step limit/
      );
    });

    it('should reject plan with incorrect confirmation flag', () => {
      const plan = {
        task: 'Write file',
        steps: [
          { action: 'writeFile', path: './test.txt', content: 'test' },
        ],
        requiresConfirmation: false,
      };

      expect(() => validateTaskPlan(plan)).toThrow(PlanValidationError);
      expect(() => validateTaskPlan(plan)).toThrow(/confirmation flag/);
    });

    it('should reject malformed plan structure', () => {
      const plan = {
        task: 'Invalid',
        steps: [{ action: 'invalidAction' }],
        requiresConfirmation: false,
      };

      expect(() => validateTaskPlan(plan)).toThrow(PlanValidationError);
    });
  });
});
