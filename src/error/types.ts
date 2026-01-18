export enum ErrorCategory {
  SYSTEM = 'system',
  CONFIGURATION = 'configuration', 
  PLANNING = 'planning',
  EXECUTION = 'execution',
  SAFETY = 'safety',
  AI = 'ai',
  FILE_SYSTEM = 'file_system',
  NETWORK = 'network',
  VALIDATION = 'validation',
  USER_INPUT = 'user_input'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorRecoveryAction {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  ABORT = 'abort',
  USER_INTERVENTION = 'user_intervention',
  IGNORE = 'ignore',
  RESTART = 'restart'
}

export interface ErrorContext {
  operation: string;
  step?: string;
  file?: string;
  workspace?: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  additionalData?: Record<string, any>;
}

export interface RecoveryStrategy {
  action: ErrorRecoveryAction;
  maxRetries?: number;
  retryDelay?: number; // milliseconds
  fallbackMethod?: () => Promise<any>;
  userMessage?: string;
  requiresConfirmation?: boolean;
}

export class CoworkError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly recoveryStrategy: RecoveryStrategy;
  public readonly code?: string;
  public readonly cause?: Error;
  public readonly retryable: boolean;
  public readonly userFriendly: boolean;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    context: ErrorContext,
    recoveryStrategy: RecoveryStrategy,
    options: {
      code?: string;
      cause?: Error;
      retryable?: boolean;
      userFriendly?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'CoworkError';
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.recoveryStrategy = recoveryStrategy;
    this.code = options.code;
    this.cause = options.cause;
    this.retryable = options.retryable ?? (recoveryStrategy.action === ErrorRecoveryAction.RETRY);
    this.userFriendly = options.userFriendly ?? true;
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CoworkError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      context: this.context,
      recoveryStrategy: {
        action: this.recoveryStrategy.action,
        userMessage: this.recoveryStrategy.userMessage,
        requiresConfirmation: this.recoveryStrategy.requiresConfirmation
      },
      retryable: this.retryable,
      userFriendly: this.userFriendly,
      stack: this.stack
    };
  }

  toString() {
    return `[${this.severity.toUpperCase()}] ${this.category}: ${this.message}`;
  }
}

// Specific Error Types
export class ConfigurationError extends CoworkError {
  constructor(message: string, context: ErrorContext, recoveryStrategy?: RecoveryStrategy) {
    super(
      message,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.MEDIUM,
      context,
      recoveryStrategy || {
        action: ErrorRecoveryAction.USER_INTERVENTION,
        userMessage: 'Please check your configuration file and try again.',
        requiresConfirmation: false
      },
      { code: 'CONFIG_ERROR' }
    );
    this.name = 'ConfigurationError';
  }
}

export class AIProviderError extends CoworkError {
  constructor(message: string, context: ErrorContext, cause?: Error, recoveryStrategy?: RecoveryStrategy) {
    super(
      message,
      ErrorCategory.AI,
      ErrorSeverity.HIGH,
      context,
      recoveryStrategy || {
        action: ErrorRecoveryAction.FALLBACK,
        fallbackMethod: undefined, // Will be provided by caller
        userMessage: 'AI service is unavailable. Falling back to rule-based planning.',
        requiresConfirmation: false
      },
      { code: 'AI_PROVIDER_ERROR', cause, retryable: true }
    );
    this.name = 'AIProviderError';
  }
}

export class FileSystemError extends CoworkError {
  constructor(message: string, context: ErrorContext, cause?: Error, recoveryStrategy?: RecoveryStrategy) {
    super(
      message,
      ErrorCategory.FILE_SYSTEM,
      ErrorSeverity.MEDIUM,
      context,
      recoveryStrategy || {
        action: ErrorRecoveryAction.RETRY,
        maxRetries: 3,
        retryDelay: 1000,
        userMessage: 'File system error. Retrying...',
        requiresConfirmation: false
      },
      { code: 'FILESYSTEM_ERROR', cause, retryable: true }
    );
    this.name = 'FileSystemError';
  }
}

export class PlanningError extends CoworkError {
  constructor(message: string, context: ErrorContext, cause?: Error, recoveryStrategy?: RecoveryStrategy) {
    super(
      message,
      ErrorCategory.PLANNING,
      ErrorSeverity.HIGH,
      context,
      recoveryStrategy || {
        action: ErrorRecoveryAction.FALLBACK,
        userMessage: 'Planning failed. Using simplified approach.',
        requiresConfirmation: false
      },
      { code: 'PLANNING_ERROR', cause }
    );
    this.name = 'PlanningError';
  }
}

export class ExecutionError extends CoworkError {
  constructor(message: string, context: ErrorContext, cause?: Error, stepId?: string) {
    super(
      message,
      ErrorCategory.EXECUTION,
      ErrorSeverity.HIGH,
      context,
      {
        action: ErrorRecoveryAction.USER_INTERVENTION,
        userMessage: `Step execution failed: ${stepId ? `Step ${stepId}` : 'Unknown step'}. Please check the error and try again.`,
        requiresConfirmation: true
      },
      { code: 'EXECUTION_ERROR', cause, retryable: false }
    );
    this.name = 'ExecutionError';
  }
}

export class SafetyError extends CoworkError {
  constructor(message: string, context: ErrorContext, recoveryStrategy?: RecoveryStrategy) {
    super(
      message,
      ErrorCategory.SAFETY,
      ErrorSeverity.CRITICAL,
      context,
      recoveryStrategy || {
        action: ErrorRecoveryAction.ABORT,
        userMessage: 'Safety check failed. Operation aborted for your protection.',
        requiresConfirmation: false
      },
      { code: 'SAFETY_ERROR', userFriendly: true }
    );
    this.name = 'SafetyError';
  }
}

export class ValidationError extends CoworkError {
  constructor(message: string, context: ErrorContext, fieldName?: string) {
    super(
      message,
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      context,
      {
        action: ErrorRecoveryAction.USER_INTERVENTION,
        userMessage: `Validation failed${fieldName ? ` for field: ${fieldName}` : ''}. Please correct the input and try again.`,
        requiresConfirmation: false
      },
      { code: 'VALIDATION_ERROR' }
    );
    this.name = 'ValidationError';
  }
}

export class NetworkError extends CoworkError {
  constructor(message: string, context: ErrorContext, cause?: Error) {
    super(
      message,
      ErrorCategory.NETWORK,
      ErrorSeverity.HIGH,
      context,
      {
        action: ErrorRecoveryAction.RETRY,
        maxRetries: 5,
        retryDelay: 2000,
        userMessage: 'Network error. Retrying with exponential backoff...',
        requiresConfirmation: false
      },
      { code: 'NETWORK_ERROR', cause, retryable: true }
    );
    this.name = 'NetworkError';
  }
}

// Error Factory for creating appropriate error types
export class ErrorFactory {
  static createError(
    error: Error | string,
    category: ErrorCategory,
    context: ErrorContext,
    options: {
      severity?: ErrorSeverity;
      recoveryStrategy?: RecoveryStrategy;
      code?: string;
      retryable?: boolean;
    } = {}
  ): CoworkError {
    
    const message = typeof error === 'string' ? error : error.message;
    const cause = typeof error === 'string' ? undefined : error;
    const severity = options.severity || ErrorSeverity.MEDIUM;

    switch (category) {
      case ErrorCategory.CONFIGURATION:
        return new ConfigurationError(message, context, options.recoveryStrategy);
      case ErrorCategory.AI:
        return new AIProviderError(message, context, cause, options.recoveryStrategy);
      case ErrorCategory.FILE_SYSTEM:
        return new FileSystemError(message, context, cause, options.recoveryStrategy);
      case ErrorCategory.PLANNING:
        return new PlanningError(message, context, cause, options.recoveryStrategy);
      case ErrorCategory.EXECUTION:
        return new ExecutionError(message, context, cause);
      case ErrorCategory.SAFETY:
        return new SafetyError(message, context, options.recoveryStrategy);
      case ErrorCategory.VALIDATION:
        return new ValidationError(message, context);
      case ErrorCategory.NETWORK:
        return new NetworkError(message, context, cause);
      default:
        return new CoworkError(
          message,
          category,
          severity,
          context,
          options.recoveryStrategy || {
            action: ErrorRecoveryAction.ABORT,
            userMessage: 'An unexpected error occurred.'
          },
          { code: options.code, cause, retryable: options.retryable }
        );
    }
  }

  static fromException(
    error: Error,
    operation: string,
    additionalContext?: Partial<ErrorContext>
  ): CoworkError {
    const context: ErrorContext = {
      operation,
      timestamp: new Date(),
      ...additionalContext
    };

    // Try to infer category from error message or type
    let category = ErrorCategory.SYSTEM;
    if (error.message.includes('ENOENT') || error.message.includes('EACCES')) {
      category = ErrorCategory.FILE_SYSTEM;
    } else if (error.message.includes('AI') || error.message.includes('OpenAI') || error.message.includes('Anthropic')) {
      category = ErrorCategory.AI;
    } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('timeout')) {
      category = ErrorCategory.NETWORK;
    } else if (error.message.includes('validation') || error.message.includes('Invalid')) {
      category = ErrorCategory.VALIDATION;
    }

    return this.createError(error, category, context);
  }
}

// Error Logger Interface
export interface ErrorLogger {
  log(error: CoworkError): Promise<void>;
  getErrors(filter?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
  }): Promise<CoworkError[]>;
  clear(): Promise<void>;
}

// Recovery Manager Interface
export interface RecoveryManager {
  attemptRecovery(error: CoworkError): Promise<any>;
  canRecover(error: CoworkError): boolean;
  registerCustomStrategy(errorType: string, strategy: RecoveryStrategy): void;
}