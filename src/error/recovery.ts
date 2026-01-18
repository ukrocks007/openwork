import { 
  CoworkError, 
  ErrorRecoveryAction, 
  RecoveryManager, 
  RecoveryStrategy,
  ErrorFactory,
  ErrorCategory,
  ErrorSeverity 
} from './types.js';
import { TaskStep, ExecutorResult } from '../types/index.js';

export class DefaultRecoveryManager implements RecoveryManager {
  private customStrategies = new Map<string, RecoveryStrategy>();
  private retryCounters = new Map<string, number>();

  async attemptRecovery(error: CoworkError): Promise<any> {
    const strategy = this.getStrategy(error);
    const retryKey = this.getRetryKey(error);

    switch (strategy.action) {
      case ErrorRecoveryAction.RETRY:
        return await this.performRetry(error, strategy, retryKey);
      
      case ErrorRecoveryAction.FALLBACK:
        return await this.performFallback(error, strategy);
      
      case ErrorRecoveryAction.USER_INTERVENTION:
        return await this.requestUserIntervention(error, strategy);
      
      case ErrorRecoveryAction.ABORT:
        throw error;
      
      case ErrorRecoveryAction.IGNORE:
        return null; // Continue execution
      
      case ErrorRecoveryAction.RESTART:
        return await this.performRestart(error, strategy);
      
      default:
        throw new Error(`Unknown recovery action: ${strategy.action}`);
    }
  }

  canRecover(error: CoworkError): boolean {
    const strategy = this.getStrategy(error);
    
    // Check if we've exceeded retry limits
    if (strategy.action === ErrorRecoveryAction.RETRY) {
      const retryKey = this.getRetryKey(error);
      const currentRetries = this.retryCounters.get(retryKey) || 0;
      const maxRetries = strategy.maxRetries || 3;
      
      if (currentRetries >= maxRetries) {
        return false;
      }
    }
    
    // Check if we have a fallback method
    if (strategy.action === ErrorRecoveryAction.FALLBACK && !strategy.fallbackMethod) {
      return false;
    }
    
    return true;
  }

  registerCustomStrategy(errorType: string, strategy: RecoveryStrategy): void {
    this.customStrategies.set(errorType, strategy);
  }

  private getStrategy(error: CoworkError): RecoveryStrategy {
    // Check for custom strategies first
    const customStrategy = this.customStrategies.get(error.name);
    if (customStrategy) {
      return customStrategy;
    }

    // Use the error's built-in strategy
    return error.recoveryStrategy;
  }

  private async performRetry(error: CoworkError, strategy: RecoveryStrategy, retryKey: string): Promise<any> {
    const currentRetries = this.retryCounters.get(retryKey) || 0;
    const maxRetries = strategy.maxRetries || 3;

    if (currentRetries >= maxRetries) {
      throw ErrorFactory.createError(
        `Maximum retries (${maxRetries}) exceeded for ${error.context.operation}`,
        ErrorCategory.SYSTEM,
        error.context,
        { severity: ErrorSeverity.HIGH, retryable: false }
      );
    }

    const retryDelay = this.calculateRetryDelay(currentRetries, strategy.retryDelay || 1000);
    
    console.log(`🔄 Retrying ${error.context.operation} (attempt ${currentRetries + 1}/${maxRetries}) in ${retryDelay}ms...`);
    
    // Increment retry counter
    this.retryCounters.set(retryKey, currentRetries + 1);
    
    // Wait before retry
    await this.delay(retryDelay);
    
    // Re-execute the original operation
    return await this.retryOriginalOperation(error);
  }

  private async performFallback(error: CoworkError, strategy: RecoveryStrategy): Promise<any> {
    if (!strategy.fallbackMethod) {
      throw ErrorFactory.createError(
        `No fallback method available for ${error.context.operation}`,
        ErrorCategory.SYSTEM,
        error.context,
        { severity: ErrorSeverity.HIGH, retryable: false }
      );
    }

    console.log(`🔄 Falling back for ${error.context.operation}: ${strategy.userMessage}`);
    
    try {
      return await strategy.fallbackMethod();
    } catch (fallbackError) {
      throw ErrorFactory.createError(
        `Fallback method failed for ${error.context.operation}: ${fallbackError}`,
        ErrorCategory.SYSTEM,
        error.context,
        { 
          severity: ErrorSeverity.CRITICAL, 
          retryable: false
        }
      );
    }
  }

  private async requestUserIntervention(error: CoworkError, strategy: RecoveryStrategy): Promise<any> {
    console.log(`👤 User intervention required: ${strategy.userMessage}`);
    
    if (strategy.requiresConfirmation) {
      const confirmed = await this.promptUserConfirmation(error, strategy);
      if (!confirmed) {
        throw ErrorFactory.createError(
          `User cancelled operation ${error.context.operation}`,
          ErrorCategory.USER_INPUT,
          error.context,
          { severity: ErrorSeverity.MEDIUM, retryable: false }
        );
      }
    }

    // For user intervention, we typically need to re-raise the error for the caller to handle
    throw error;
  }

  private async performRestart(error: CoworkError, strategy: RecoveryStrategy): Promise<any> {
    console.log(`🔄 Restarting ${error.context.operation}...`);
    
    // Clear retry counters for fresh start
    this.clearRetryCounters();
    
    // Reset state if possible
    await this.resetState();
    
    // Retry the original operation
    return await this.retryOriginalOperation(error);
  }

  private async retryOriginalOperation(error: CoworkError): Promise<any> {
    // This is a simplified approach - in a real implementation,
    // we would need to track the original operation and retry it
    
    // For now, we'll re-throw the error to let the caller handle the retry logic
    throw new Error(`Retry mechanism not implemented for operation: ${error.context.operation}`);
  }

  private calculateRetryDelay(attempt: number, baseDelay: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getRetryKey(error: CoworkError): string {
    const parts = [
      error.category,
      error.context.operation,
      error.context.step || '',
      error.context.file || ''
    ].filter(part => part.length > 0);
    
    return parts.join(':');
  }

  private async promptUserConfirmation(error: CoworkError, strategy: RecoveryStrategy): Promise<boolean> {
    // In a real implementation, this would use a proper CLI prompt
    // For now, we'll return false to be safe
    console.log(`\n❓ ${strategy.userMessage}`);
    console.log('Please manually resolve the issue and restart the operation.');
    return false;
  }

  private async resetState(): Promise<void> {
    // Reset any cached state, connections, etc.
    // This would be implemented based on the specific needs of the system
    console.log('🔄 Resetting system state...');
  }

  private clearRetryCounters(): void {
    this.retryCounters.clear();
  }

  // Statistics and monitoring
  public getRetryStats(): Map<string, number> {
    return new Map(this.retryCounters);
  }

  public clearRetryStats(): void {
    this.clearRetryCounters();
  }
}

// Specialized recovery handlers for different error types
export class AIOperationRecovery {
  static createFallbackStrategy(): RecoveryStrategy {
    return {
      action: ErrorRecoveryAction.FALLBACK,
      userMessage: 'AI service unavailable. Using rule-based approach.',
      requiresConfirmation: false,
      fallbackMethod: async () => {
        console.log('🔄 Using rule-based fallback planning');
        return null; // Signal to use fallback
      }
    };
  }
}

export class FileOperationRecovery {
  static createRetryStrategy(maxRetries: number = 3): RecoveryStrategy {
    return {
      action: ErrorRecoveryAction.RETRY,
      maxRetries,
      retryDelay: 1000,
      userMessage: 'File operation failed. Retrying...',
      requiresConfirmation: false
    };
  }

  static createPermissionErrorStrategy(): RecoveryStrategy {
    return {
      action: ErrorRecoveryAction.USER_INTERVENTION,
      userMessage: 'Permission denied. Please check file permissions and try again.',
      requiresConfirmation: false
    };
  }
}

export class NetworkOperationRecovery {
  static createExponentialBackoffStrategy(maxRetries: number = 5): RecoveryStrategy {
    return {
      action: ErrorRecoveryAction.RETRY,
      maxRetries,
      retryDelay: 2000,
      userMessage: 'Network operation failed. Retrying with exponential backoff...',
      requiresConfirmation: false
    };
  }
}