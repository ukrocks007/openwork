import { Planner, PlannerError, PlannerConfig } from '../planner';
import { Logger } from '../logger';

// Mock Ollama
jest.mock('ollama', () => {
  return {
    Ollama: jest.fn().mockImplementation(() => {
      return {
        generate: jest.fn(),
        list: jest.fn(),
      };
    }),
  };
});

describe('Planner', () => {
  let planner: Planner;
  let mockOllama: any;
  let config: PlannerConfig;

  beforeEach(() => {
    config = {
      model: 'qwen2.5:0.5b',
      temperature: 0.2,
      maxTokens: 1024,
      ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:8080',
    };

    const logger = new Logger({ logToFile: false, logToConsole: false });
    planner = new Planner(config, logger);

    // Get mock instance
    mockOllama = (planner as any).ollama;
  });

  describe('generatePlan', () => {
    it('should generate valid plan from clean JSON response', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Read files',
          steps: [{ action: 'readFiles', path: './test.txt' }],
          requiresConfirmation: false,
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      const plan = await planner.generatePlan('Read files');

      expect(plan).toMatchObject({
        task: 'Read files',
        steps: [{ action: 'readFiles', path: './test.txt' }],
        requiresConfirmation: false,
      });
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockResponse = {
        response: '```json\n' + JSON.stringify({
          task: 'Create file',
          steps: [
            {
              action: 'createFile',
              path: './output.txt',
              content: 'test',
            },
          ],
          requiresConfirmation: true,
        }) + '\n```',
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      const plan = await planner.generatePlan('Create file');

      expect(plan).toMatchObject({
        task: 'Create file',
        requiresConfirmation: true,
      });
    });

    it('should extract JSON from response with extra text', async () => {
      const jsonPlan = {
        task: 'Test task',
        steps: [{ action: 'noop' }],
        requiresConfirmation: false,
      };

      const mockResponse = {
        response: `Here is the plan:\n${JSON.stringify(jsonPlan)}\nHope this helps!`,
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      const plan = await planner.generatePlan('Test task');

      expect(plan.task).toBe('Test task');
      expect(plan.steps).toHaveLength(1);
    });

    it('should throw error for invalid JSON', async () => {
      const mockResponse = {
        response: 'This is not JSON at all',
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      await expect(planner.generatePlan('Invalid')).rejects.toThrow(
        PlannerError
      );
    });

    it('should throw error for malformed JSON', async () => {
      const mockResponse = {
        response: '{ "task": "test", invalid json }',
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      await expect(planner.generatePlan('Malformed')).rejects.toThrow(
        PlannerError
      );
    });

    it('should validate plan structure', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Invalid plan',
          steps: [], // Empty steps should fail validation
          requiresConfirmation: false,
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      await expect(planner.generatePlan('Invalid plan')).rejects.toThrow();
    });

    it('should validate confirmation flag', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Wrong confirmation',
          steps: [
            {
              action: 'writeFile',
              path: './test.txt',
              content: 'test',
            },
          ],
          requiresConfirmation: false, // Should be true for writeFile
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      await expect(
        planner.generatePlan('Wrong confirmation')
      ).rejects.toThrow();
    });

    it('should handle Ollama errors', async () => {
      mockOllama.generate.mockRejectedValue(new Error('Ollama connection failed'));

      await expect(planner.generatePlan('Test')).rejects.toThrow(
        PlannerError
      );
    });

    it('should pass correct parameters to Ollama', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Test',
          steps: [{ action: 'noop' }],
          requiresConfirmation: false,
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      await planner.generatePlan('Test task');

      expect(mockOllama.generate).toHaveBeenCalledWith({
        model: 'qwen2.5:0.5b',
        prompt: expect.stringContaining('Test task'),
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 1024,
        },
      });
    });
  });

  describe('checkAvailability', () => {
    it('should return true when Ollama is available', async () => {
      mockOllama.list.mockResolvedValue({ models: [] });

      const available = await planner.checkAvailability();

      expect(available).toBe(true);
    });

    it('should return false when Ollama is not available', async () => {
      mockOllama.list.mockRejectedValue(new Error('Connection refused'));

      const available = await planner.checkAvailability();

      expect(available).toBe(false);
    });
  });

  describe('checkModel', () => {
    it('should return true when model exists', async () => {
      mockOllama.list.mockResolvedValue({
        models: [
          { name: 'qwen2.5:0.5b' },
          { name: 'llama2:latest' },
        ],
      });

      const exists = await planner.checkModel();

      expect(exists).toBe(true);
    });

    it('should return true when model exists with different variant', async () => {
      mockOllama.list.mockResolvedValue({
        models: [
          { name: 'qwen2.5:0.5b-fp16' },
        ],
      });

      const exists = await planner.checkModel();

      // This should be false since the tag is different
      expect(exists).toBe(false);
    });

    it('should return false when model does not exist', async () => {
      mockOllama.list.mockResolvedValue({
        models: [
          { name: 'llama2:latest' },
          { name: 'mistral:7b' },
        ],
      });

      const exists = await planner.checkModel();

      expect(exists).toBe(false);
    });

    it('should return false on error', async () => {
      mockOllama.list.mockRejectedValue(new Error('Network error'));

      const exists = await planner.checkModel();

      expect(exists).toBe(false);
    });
  });

  describe('Complex plans', () => {
    it('should handle multi-step plans', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Process and summarize files',
          steps: [
            { action: 'readFiles', path: './input', pattern: '*.txt' },
            {
              action: 'extractText',
              instructions: 'Summarize all content',
            },
            {
              action: 'createFile',
              path: './output/summary.md',
              content: 'Summary',
            },
          ],
          requiresConfirmation: true,
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      const plan = await planner.generatePlan('Process and summarize files');

      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[0].action).toBe('readFiles');
      expect(plan.steps[1].action).toBe('extractText');
      expect(plan.steps[2].action).toBe('createFile');
      expect(plan.requiresConfirmation).toBe(true);
    });

    it('should handle moveFile action', async () => {
      const mockResponse = {
        response: JSON.stringify({
          task: 'Move file',
          steps: [
            {
              action: 'moveFile',
              sourcePath: './old/file.txt',
              destinationPath: './new/file.txt',
            },
          ],
          requiresConfirmation: true,
        }),
      };

      mockOllama.generate.mockResolvedValue(mockResponse);

      const plan = await planner.generatePlan('Move file');

      expect(plan.steps[0]).toMatchObject({
        action: 'moveFile',
        sourcePath: './old/file.txt',
        destinationPath: './new/file.txt',
      });
    });
  });
});
