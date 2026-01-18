import * as fs from 'fs/promises';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  logDir?: string;
  logToFile?: boolean;
  logToConsole?: boolean;
  minLevel?: LogLevel;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Structured logger for Cowork-Lite
 * Provides auditability by logging all actions and decisions
 */
export class Logger {
  private logFile?: string;
  private options: Required<LoggerOptions>;
  private buffer: LogEntry[] = [];
  private writePromise: Promise<void> = Promise.resolve();

  constructor(options: LoggerOptions = {}) {
    this.options = {
      logDir: options.logDir || path.join(process.cwd(), 'logs'),
      logToFile: options.logToFile ?? true,
      logToConsole: options.logToConsole ?? true,
      minLevel: options.minLevel || LogLevel.INFO,
    };

    if (this.options.logToFile) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(this.options.logDir, `cowork-${timestamp}.log`);
    }
  }

  /**
   * Create log directory if it doesn't exist
   */
  private async ensureLogDir(): Promise<void> {
    if (this.options.logToFile) {
      await fs.mkdir(this.options.logDir, { recursive: true });
    }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return (
      LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.options.minLevel]
    );
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context
      ? ` ${JSON.stringify(entry.context)}`
      : '';
    return `[${entry.timestamp}] ${entry.level}: ${entry.message}${contextStr}`;
  }

  /**
   * Write buffered logs to file
   */
  private async flushBuffer(): Promise<void> {
    if (!this.options.logToFile || this.buffer.length === 0 || !this.logFile) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.ensureLogDir();
      const content =
        entries.map((e) => this.formatLogEntry(e)).join('\n') + '\n';
      await fs.appendFile(this.logFile, content, 'utf-8');
    } catch (error) {
      console.error('Failed to write logs:', error);
    }
  }

  /**
   * Log a message
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    // Console output
    if (this.options.logToConsole) {
      const formatted = this.formatLogEntry(entry);
      switch (level) {
        case LogLevel.ERROR:
          console.error(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        default:
          console.log(formatted);
      }
    }

    // File output (buffered)
    if (this.options.logToFile) {
      this.buffer.push(entry);

      // Flush buffer asynchronously
      this.writePromise = this.writePromise.then(() => this.flushBuffer());
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Log task plan generation
   */
  logPlan(task: string, plan: unknown): void {
    this.info('Plan generated', { task, plan });
  }

  /**
   * Log step execution start
   */
  logStepStart(stepIndex: number, action: string): void {
    this.info(`Step ${stepIndex} started`, { stepIndex, action });
  }

  /**
   * Log step execution completion
   */
  logStepComplete(
    stepIndex: number,
    action: string,
    success: boolean,
    duration: number
  ): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Step ${stepIndex} ${success ? 'completed' : 'failed'}`;
    this.log(level, message, {
      stepIndex,
      action,
      success,
      duration,
    });
  }

  /**
   * Log execution result
   */
  logExecutionResult(success: boolean, totalDuration: number): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Execution ${success ? 'completed' : 'failed'}`;
    this.log(level, message, { success, totalDuration });
  }

  /**
   * Wait for all pending writes to complete
   */
  async flush(): Promise<void> {
    await this.writePromise;
  }

  /**
   * Get the current log file path
   */
  getLogFile(): string | undefined {
    return this.logFile;
  }
}

// Global logger instance
let globalLogger: Logger | undefined;

/**
 * Get or create global logger instance
 */
export function getLogger(options?: LoggerOptions): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(options);
  }
  return globalLogger;
}

/**
 * Reset global logger (useful for testing)
 */
export function resetLogger(): void {
  globalLogger = undefined;
}
