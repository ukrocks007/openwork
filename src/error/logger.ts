import { CoworkError, ErrorLogger, ErrorCategory, ErrorSeverity } from './types.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export class FileErrorLogger implements ErrorLogger {
  private logFile: string;
  private maxLogSize: number; // bytes
  private maxLogFiles: number;

  constructor(logDir: string = './logs', maxLogSize: number = 10 * 1024 * 1024, maxLogFiles: number = 5) {
    this.logFile = join(logDir, `cowork-errors-${new Date().toISOString().split('T')[0]}.log`);
    this.maxLogSize = maxLogSize;
    this.maxLogFiles = maxLogFiles;
  }

  async log(error: CoworkError): Promise<void> {
    try {
      // Ensure log directory exists
      await fs.mkdir(join(this.logFile, '..'), { recursive: true });
      
      // Rotate logs if necessary
      await this.rotateLogs();
      
      const logEntry = this.formatLogEntry(error);
      await fs.appendFile(this.logFile, logEntry + '\n');
      
      // Also log to console in development
      if (process.env.NODE_ENV !== 'production') {
        console.error('🔴 Error logged:', error.toString());
      }
      
    } catch (logError) {
      // If logging fails, at least log to stderr
      console.error('❌ Failed to log error:', logError);
      console.error('Original error:', error.toString());
    }
  }

  async getErrors(filter?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
  }): Promise<CoworkError[]> {
    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const errors: CoworkError[] = [];
      
      for (const line of lines) {
        try {
          const errorData = JSON.parse(line);
          const error = this.reconstructError(errorData);
          
          // Apply filters
          if (filter?.category && error.category !== filter.category) continue;
          if (filter?.severity && error.severity !== filter.severity) continue;
          if (filter?.since && error.context.timestamp < filter.since) continue;
          
          errors.push(error);
        } catch (parseError) {
          // Skip malformed log entries
          continue;
        }
      }
      
      return errors;
    } catch {
      return []; // Log file doesn't exist or can't be read
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.logFile);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  private formatLogEntry(error: CoworkError): string {
    const logData = {
      timestamp: error.context.timestamp.toISOString(),
      level: 'ERROR',
      category: error.category,
      severity: error.severity,
      code: error.code,
      message: error.message,
      operation: error.context.operation,
      step: error.context.step,
      file: error.context.file,
      workspace: error.context.workspace,
      retryable: error.retryable,
      recoveryAction: error.recoveryStrategy.action,
      userFriendly: error.userFriendly,
      stack: error.stack,
      additionalData: error.context.additionalData
    };
    
    return JSON.stringify(logData);
  }

  private reconstructError(data: any): CoworkError {
    // Recreate error context from log data
    const context = {
      operation: data.operation,
      step: data.step,
      file: data.file,
      workspace: data.workspace,
      timestamp: new Date(data.timestamp),
      additionalData: data.additionalData
    };
    
    const recoveryStrategy = {
      action: data.recoveryAction,
      userMessage: 'Recovered from log',
      requiresConfirmation: false
    };
    
    return new CoworkError(
      data.message,
      data.category,
      data.severity,
      context,
      recoveryStrategy,
      {
        code: data.code,
        retryable: data.retryable,
        userFriendly: data.userFriendly
      }
    );
  }

  private async rotateLogs(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFile);
      
      if (stats.size < this.maxLogSize) {
        return; // No rotation needed
      }
      
      // Get log directory
      const logDir = join(this.logFile, '..');
      const files = await fs.readdir(logDir);
      
      // Find existing error logs
      const errorLogs = files
        .filter(file => file.startsWith('cowork-errors-') && file.endsWith('.log'))
        .sort();
      
      // Remove oldest logs if we have too many
      while (errorLogs.length >= this.maxLogFiles) {
        const oldest = errorLogs.shift();
        if (oldest) {
          await fs.unlink(join(logDir, oldest));
        }
      }
      
      // Create timestamped backup of current log
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `cowork-errors-${timestamp}.log`;
      await fs.rename(this.logFile, join(logDir, backupName));
      
    } catch (error) {
      // If we can't rotate, continue with current log file
      console.warn('⚠️  Could not rotate error logs:', error);
    }
  }
}

export class MemoryErrorLogger implements ErrorLogger {
  private errors: CoworkError[] = [];
  private maxErrors: number;

  constructor(maxErrors: number = 1000) {
    this.maxErrors = maxErrors;
  }

  async log(error: CoworkError): Promise<void> {
    this.errors.push(error);
    
    // Keep only the most recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
    
    // Also log to console
    console.error('🔴 Error:', error.toString());
  }

  async getErrors(filter?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
  }): Promise<CoworkError[]> {
    let filteredErrors = [...this.errors];
    
    if (filter?.category) {
      filteredErrors = filteredErrors.filter(e => e.category === filter.category);
    }
    
    if (filter?.severity) {
      filteredErrors = filteredErrors.filter(e => e.severity === filter.severity);
    }
    
    if (filter?.since) {
      filteredErrors = filteredErrors.filter(e => e.context.timestamp >= filter.since!);
    }
    
    return filteredErrors;
  }

  async clear(): Promise<void> {
    this.errors = [];
  }

  getRecentErrors(count: number = 10): CoworkError[] {
    return this.errors.slice(-count);
  }

  getErrorSummary(): { [key: string]: number } {
    const summary: { [key: string]: number } = {};
    
    for (const error of this.errors) {
      const key = `${error.category}:${error.severity}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    
    return summary;
  }
}

// Composite logger that logs to multiple destinations
export class CompositeErrorLogger implements ErrorLogger {
  private loggers: ErrorLogger[];

  constructor(...loggers: ErrorLogger[]) {
    this.loggers = loggers;
  }

  async log(error: CoworkError): Promise<void> {
    const promises = this.loggers.map(logger => logger.log(error));
    await Promise.allSettled(promises);
  }

  async getErrors(filter?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: Date;
  }): Promise<CoworkError[]> {
    // Get errors from first logger that supports querying
    for (const logger of this.loggers) {
      try {
        const errors = await logger.getErrors(filter);
        if (errors.length > 0 || !('clear' in logger)) {
          return errors;
        }
      } catch {
        // Try next logger
      }
    }
    return [];
  }

  async clear(): Promise<void> {
    const promises = this.loggers.map(logger => {
      if ('clear' in logger) {
        return logger.clear();
      }
      return Promise.resolve();
    });
    await Promise.allSettled(promises);
  }

  addLogger(logger: ErrorLogger): void {
    this.loggers.push(logger);
  }

  removeLogger(logger: ErrorLogger): void {
    const index = this.loggers.indexOf(logger);
    if (index > -1) {
      this.loggers.splice(index, 1);
    }
  }
}

// Error statistics and monitoring
export class ErrorAnalyzer {
  constructor(private logger: ErrorLogger) {}

  async getErrorTrends(hours: number = 24): Promise<{
    byCategory: { [key in ErrorCategory]?: number };
    bySeverity: { [key in ErrorSeverity]?: number };
    totalErrors: number;
    criticalErrors: number;
    retryableErrors: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const errors = await this.logger.getErrors({ since });

    const byCategory: { [key in ErrorCategory]?: number } = {};
    const bySeverity: { [key in ErrorSeverity]?: number } = {};
    let criticalErrors = 0;
    let retryableErrors = 0;

    for (const error of errors) {
      // Count by category
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
      
      // Count by severity
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      
      // Count critical errors
      if (error.severity === ErrorSeverity.CRITICAL) {
        criticalErrors++;
      }
      
      // Count retryable errors
      if (error.retryable) {
        retryableErrors++;
      }
    }

    return {
      byCategory,
      bySeverity,
      totalErrors: errors.length,
      criticalErrors,
      retryableErrors
    };
  }

  async getErrorPatterns(hours: number = 24): Promise<Array<{
    pattern: string;
    count: number;
    examples: string[];
  }>> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const errors = await this.logger.getErrors({ since });

    // Group errors by similar messages
    const patterns = new Map<string, { count: number; examples: string[] }>();

    for (const error of errors) {
      // Create a simple pattern by removing specifics
      let pattern = error.message
        .replace(/\d+/g, 'N') // Replace numbers
        .replace(/['"`]/g, '') // Remove quotes
        .replace(/\b\w+@\w+\.\w+\b/g, 'EMAIL') // Replace emails
        .replace(/https?:\/\/\S+/g, 'URL') // Replace URLs
        .replace(/\/[^\/]+/g, '/PATH'); // Replace file paths

      const existing = patterns.get(pattern);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(error.message);
        }
      } else {
        patterns.set(pattern, {
          count: 1,
          examples: [error.message]
        });
      }
    }

    // Convert to array and sort by frequency
    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({ pattern, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 patterns
  }
}