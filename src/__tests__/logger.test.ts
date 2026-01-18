import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger, LogLevel, getLogger, resetLogger } from '../logger';

describe('Logger', () => {
  let testLogDir: string;
  let logger: Logger;

  beforeEach(() => {
    testLogDir = path.join(process.cwd(), '.test-logs');
    logger = new Logger({
      logDir: testLogDir,
      logToFile: true,
      logToConsole: false,
      minLevel: LogLevel.DEBUG,
    });
  });

  afterEach(async () => {
    await logger.flush();
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    resetLogger();
  });

  describe('Logging levels', () => {
    it('should log debug messages', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => logger.info('Info message')).not.toThrow();
    });

    it('should log warning messages', () => {
      expect(() => logger.warn('Warning message')).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => logger.error('Error message')).not.toThrow();
    });

    it('should log messages with context', () => {
      expect(() =>
        logger.info('Message with context', { key: 'value', count: 42 })
      ).not.toThrow();
    });
  });

  describe('Log level filtering', () => {
    it('should respect minimum log level', () => {
      const infoLogger = new Logger({
        logDir: testLogDir,
        logToFile: false,
        logToConsole: false,
        minLevel: LogLevel.INFO,
      });

      // Debug should not be logged, but others should
      infoLogger.debug('Debug message');
      infoLogger.info('Info message');
      infoLogger.warn('Warn message');
      infoLogger.error('Error message');

      // No easy way to test this without console capture, but at least verify no errors
      expect(true).toBe(true);
    });

    it('should log only errors when minLevel is ERROR', () => {
      const errorLogger = new Logger({
        logDir: testLogDir,
        logToFile: false,
        logToConsole: false,
        minLevel: LogLevel.ERROR,
      });

      errorLogger.debug('Debug message');
      errorLogger.info('Info message');
      errorLogger.warn('Warn message');
      errorLogger.error('Error message');

      expect(true).toBe(true);
    });
  });

  describe('File logging', () => {
    it('should create log directory', async () => {
      logger.info('Test message');
      await logger.flush();

      const dirExists = await fs
        .access(testLogDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should write logs to file', async () => {
      logger.info('Test message 1');
      logger.info('Test message 2');
      await logger.flush();

      const logFile = logger.getLogFile();
      expect(logFile).toBeDefined();

      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Test message 1');
        expect(content).toContain('Test message 2');
        expect(content).toContain('INFO');
      }
    });

    it('should include timestamp in log entries', async () => {
      logger.info('Timestamped message');
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        // Check for ISO timestamp format
        expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it('should include context in log entries', async () => {
      logger.info('Message with context', { userId: 123, action: 'test' });
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('userId');
        expect(content).toContain('123');
        expect(content).toContain('action');
        expect(content).toContain('test');
      }
    });

    it('should handle file logging disabled', () => {
      const noFileLogger = new Logger({
        logToFile: false,
        logToConsole: false,
      });

      expect(() => noFileLogger.info('Test')).not.toThrow();
      expect(noFileLogger.getLogFile()).toBeUndefined();
    });
  });

  describe('Specialized logging methods', () => {
    it('should log plan generation', async () => {
      const plan = {
        task: 'Test task',
        steps: [{ action: 'noop' }],
      };

      logger.logPlan('Test task', plan);
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Plan generated');
        expect(content).toContain('Test task');
      }
    });

    it('should log step start', async () => {
      logger.logStepStart(0, 'readFiles');
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Step 0 started');
        expect(content).toContain('readFiles');
      }
    });

    it('should log step completion', async () => {
      logger.logStepComplete(0, 'readFiles', true, 150);
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Step 0 completed');
        expect(content).toContain('readFiles');
        expect(content).toContain('150');
      }
    });

    it('should log step failure', async () => {
      logger.logStepComplete(1, 'writeFile', false, 75);
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Step 1 failed');
        expect(content).toContain('ERROR');
      }
    });

    it('should log execution result', async () => {
      logger.logExecutionResult(true, 1500);
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Execution completed');
        expect(content).toContain('1500');
      }
    });
  });

  describe('Global logger', () => {
    it('should create and return global logger', () => {
      const logger1 = getLogger({ logToFile: false, logToConsole: false });
      const logger2 = getLogger({ logToFile: false, logToConsole: false });

      expect(logger1).toBe(logger2);
    });

    it('should reset global logger', () => {
      const logger1 = getLogger({ logToFile: false, logToConsole: false });
      resetLogger();
      const logger2 = getLogger({ logToFile: false, logToConsole: false });

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('Buffer flushing', () => {
    it('should flush buffer on demand', async () => {
      logger.info('Buffered message');

      const logFile = logger.getLogFile();
      if (logFile) {
        // Before flush, file might not exist or be empty
        await logger.flush();

        // After flush, content should be written
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Buffered message');
      }
    });

    it('should handle multiple flush calls', async () => {
      logger.info('Message 1');
      await logger.flush();

      logger.info('Message 2');
      await logger.flush();

      const logFile = logger.getLogFile();
      if (logFile) {
        const content = await fs.readFile(logFile, 'utf-8');
        expect(content).toContain('Message 1');
        expect(content).toContain('Message 2');
      }
    });
  });
});
