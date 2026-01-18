import { z } from 'zod';
import { TaskPlan, Action, ActionType } from '../types';

/**
 * Zod schemas for validating task plans
 */

const ActionTypeSchema = z.enum([
  'readFiles',
  'createFile',
  'writeFile',
  'moveFile',
  'extractText',
  'runPlaywrightTask',
  'noop',
]);

const ReadFilesActionSchema = z.object({
  action: z.literal('readFiles'),
  path: z.string().min(1),
  pattern: z.string().optional(),
  description: z.string().optional(),
});

const CreateFileActionSchema = z.object({
  action: z.literal('createFile'),
  path: z.string().min(1),
  content: z.string(),
  description: z.string().optional(),
});

const WriteFileActionSchema = z.object({
  action: z.literal('writeFile'),
  path: z.string().min(1),
  content: z.string(),
  description: z.string().optional(),
});

const MoveFileActionSchema = z.object({
  action: z.literal('moveFile'),
  sourcePath: z.string().min(1),
  destinationPath: z.string().min(1),
  description: z.string().optional(),
});

const ExtractTextActionSchema = z.object({
  action: z.literal('extractText'),
  instructions: z.string().min(1),
  description: z.string().optional(),
});

const RunPlaywrightTaskActionSchema = z.object({
  action: z.literal('runPlaywrightTask'),
  taskType: z.enum(['fetchPage', 'extractData', 'fillForm']),
  url: z.string().url().optional(),
  selectors: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
});

const NoopActionSchema = z.object({
  action: z.literal('noop'),
  description: z.string().optional(),
});

const ActionSchema = z.union([
  ReadFilesActionSchema,
  CreateFileActionSchema,
  WriteFileActionSchema,
  MoveFileActionSchema,
  ExtractTextActionSchema,
  RunPlaywrightTaskActionSchema,
  NoopActionSchema,
]);

const TaskPlanSchema = z.object({
  task: z.string().min(1),
  steps: z.array(ActionSchema).min(1),
  requiresConfirmation: z.boolean(),
  estimatedSteps: z.number().optional(),
});

export class PlanValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

/**
 * Validates a task plan against the DSL schema
 */
export function validatePlan(plan: unknown): TaskPlan {
  try {
    return TaskPlanSchema.parse(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PlanValidationError(
        'Invalid task plan structure',
        error.issues
      );
    }
    throw error;
  }
}

/**
 * Checks if an action is destructive (requires confirmation)
 */
export function isDestructiveAction(action: Action): boolean {
  return (
    action.action === 'writeFile' ||
    action.action === 'moveFile' ||
    action.action === 'createFile'
  );
}

/**
 * Validates that a plan has the correct confirmation flag
 */
export function validateConfirmationFlag(plan: TaskPlan): boolean {
  const hasDestructiveActions = plan.steps.some(isDestructiveAction);
  return plan.requiresConfirmation === hasDestructiveActions;
}

/**
 * Validates plan step limits
 */
export function validateStepLimits(
  plan: TaskPlan,
  maxSteps: number
): boolean {
  return plan.steps.length <= maxSteps;
}

/**
 * Comprehensive plan validation
 */
export function validateTaskPlan(
  plan: unknown,
  maxSteps: number = 50
): TaskPlan {
  // First validate structure
  const validatedPlan = validatePlan(plan);

  // Check step limits
  if (!validateStepLimits(validatedPlan, maxSteps)) {
    throw new PlanValidationError(
      `Plan exceeds maximum step limit of ${maxSteps}`
    );
  }

  // Validate confirmation flag
  if (!validateConfirmationFlag(validatedPlan)) {
    throw new PlanValidationError(
      'Plan confirmation flag does not match presence of destructive actions'
    );
  }

  return validatedPlan;
}
