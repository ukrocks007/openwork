import { Ollama } from 'ollama';
import { TaskPlan } from '../types';
import { validateTaskPlan } from './validator';
import { Logger } from '../logger';

export interface PlannerConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  ollamaHost?: string;
}

export class PlannerError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'PlannerError';
  }
}

const SYSTEM_PROMPT = `You are a task planning assistant for Cowork-Lite, a deterministic AI coworker.

Your ONLY job is to convert user tasks into structured JSON plans.

RULES:
1. Output ONLY valid JSON - no markdown, no explanations, no preamble
2. Use only these actions: readFiles, createFile, writeFile, moveFile, extractText, noop
3. Set requiresConfirmation=true if plan contains: createFile, writeFile, or moveFile
4. Set requiresConfirmation=false otherwise
5. Be specific with file paths
6. Keep plans simple and sequential
7. Maximum 50 steps

JSON SCHEMA:
{
  "task": "string (user's task)",
  "steps": [
    {
      "action": "readFiles" | "createFile" | "writeFile" | "moveFile" | "extractText" | "noop",
      "path"?: "string (for file actions)",
      "sourcePath"?: "string (for moveFile)",
      "destinationPath"?: "string (for moveFile)",
      "content"?: "string (for createFile/writeFile)",
      "instructions"?: "string (for extractText)",
      "pattern"?: "string (optional glob for readFiles)",
      "description"?: "string (optional)"
    }
  ],
  "requiresConfirmation": boolean
}

EXAMPLES:

User: "Read all markdown files in ./docs and create a summary"
Output:
{
  "task": "Read all markdown files in ./docs and create a summary",
  "steps": [
    {"action": "readFiles", "path": "./docs", "pattern": "*.md"},
    {"action": "extractText", "instructions": "Create a summary of all documentation"},
    {"action": "createFile", "path": "./summary.md", "content": "Summary will be generated"}
  ],
  "requiresConfirmation": true
}

User: "Show me what's in the config file"
Output:
{
  "task": "Show me what's in the config file",
  "steps": [
    {"action": "readFiles", "path": "./config.json"}
  ],
  "requiresConfirmation": false
}`;

/**
 * Planner service for generating task plans using Ollama
 */
export class Planner {
  private ollama: Ollama;
  private config: PlannerConfig;
  private logger?: Logger;

  constructor(config: PlannerConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger;

    this.ollama = new Ollama({
      host: config.ollamaHost || 'http://localhost:8080',
    });
  }

  /**
   * Clean and parse LLM response to extract JSON
   */
  private parseResponse(response: string): unknown {
    // Remove markdown code blocks if present
    let cleaned = response.trim();

    // Remove ```json and ``` markers
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/, '');
    cleaned = cleaned.replace(/\s*```$/,'' );

    // Find the first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new PlannerError('No JSON found in response');
    }

    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new PlannerError('Failed to parse JSON from response', {
        response: jsonStr,
        error,
      });
    }
  }

  /**
   * Generate a task plan from user input
   */
  async generatePlan(userTask: string): Promise<TaskPlan> {
    this.logger?.info('Generating plan', { task: userTask });

    try {
      // Call Ollama
      const response = await this.ollama.generate({
        model: this.config.model,
        prompt: `${SYSTEM_PROMPT}\n\nUser: "${userTask}"\n\nOutput:`,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      });

      this.logger?.debug('Ollama response received', {
        response: response.response,
      });

      // Parse response
      const parsed = this.parseResponse(response.response);

      // Validate against schema
      const validatedPlan = validateTaskPlan(parsed);

      this.logger?.logPlan(userTask, validatedPlan);

      return validatedPlan;
    } catch (error) {
      this.logger?.error('Plan generation failed', {
        task: userTask,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof PlannerError) {
        throw error;
      }

      throw new PlannerError(
        'Failed to generate plan',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Check if Ollama is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch (error) {
      this.logger?.warn('Ollama not available', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check if the configured model is available
   */
  async checkModel(): Promise<boolean> {
    try {
      const models = await this.ollama.list();
      const modelExists = models.models.some(
        (m) => m.name === this.config.model || m.name.startsWith(this.config.model + ':')
      );

      if (!modelExists) {
        this.logger?.warn('Model not found', { model: this.config.model });
      }

      return modelExists;
    } catch (error) {
      this.logger?.error('Failed to check model', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
