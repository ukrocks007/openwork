import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Planner } from '../src/planner/index';
import { Executor } from '../src/executor/index';
import { SafetyLayer } from '../src/safety/index';
import { TestWorkspace } from './utils';
import type { PlannerConfig, ExecutorResult } from '../src/types/index';

describe('Performance Benchmarks', () => {
  let workspace: TestWorkspace;
  let planner: Planner;
  let executor: Executor;
  let safety: SafetyLayer;
  let config: PlannerConfig;
  let workspacePath: string;

  beforeEach(async () => {
    workspace = new TestWorkspace();
    workspacePath = await workspace.setup();
    config = {
      maxSteps: 20,
      timeout: 5000,
      allowedOperations: ['readFiles', 'writeFile', 'createFolder', 'renameFile', 'extractData', 'generateReport']
    };
    planner = new Planner(config);
    executor = new Executor();
    safety = new SafetyLayer();
  });

  afterEach(() => {
    workspace.cleanup();
  });

  describe('Workflow Performance', () => {
    it('should complete file organization within performance target', async () => {
      // Setup test files
      await workspace.createFile('receipt1.pdf', 'receipt content');
      await workspace.createFile('invoice.docx', 'invoice content');
      await workspace.createFile('data.xlsx', 'spreadsheet content');
      await workspace.createFile('notes.txt', 'text notes');

      const startTime = Date.now();
      
      const plan = await planner.createPlan('organize this folder into categories', workspacePath);
      expect(plan.steps.length).toBeGreaterThan(0);

      for (const step of plan.steps) {
        const result: ExecutorResult = await executor.executeStep(step, { workspace: workspacePath, dryRun: false, logs: [], confirmedSteps: new Set() });
        expect(result.success).toBe(true);
      }

      const executionTime = Date.now() - startTime;
      console.log(`File organization completed in ${executionTime}ms`);
      
      // Performance target: under 30 seconds for typical workflow
      expect(executionTime).toBeLessThan(30000);
    }, 35000);

    it('should complete report generation within performance target', async () => {
      // Setup test files for reporting
      await workspace.createFile('data1.json', JSON.stringify({ sales: 100, revenue: 1000 }));
      await workspace.createFile('data2.json', JSON.stringify({ sales: 150, revenue: 1500 }));
      await workspace.createFile('notes.md', '# Project Notes\n\nImportant information here.');

      const startTime = Date.now();
      
      const plan = await planner.createPlan('generate a summary report from this workspace', workspacePath);
      expect(plan.steps.length).toBeGreaterThan(0);

      for (const step of plan.steps) {
        const result: ExecutorResult = await executor.executeStep(step, { workspace: workspacePath, dryRun: false, logs: [], confirmedSteps: new Set() });
        expect(result.success).toBe(true);
      }

      const executionTime = Date.now() - startTime;
      console.log(`Report generation completed in ${executionTime}ms`);
      
      // Performance target: under 20 seconds for report generation
      expect(executionTime).toBeLessThan(20000);
    }, 25000);

    it('should complete data extraction within performance target', async () => {
      // Setup test CSV files
      await workspace.createFile('sales.csv', 'Product,Amount,Date\nLaptop,1200,2024-01-15\nMouse,25,2024-01-16');
      await workspace.createFile('inventory.csv', 'Item,Quantity\nLaptop,10\nMouse,50');

      const startTime = Date.now();
      
      const plan = await planner.createPlan('extract data from CSV files and create summary', workspacePath);
      expect(plan.steps.length).toBeGreaterThan(0);

      for (const step of plan.steps) {
        const result: ExecutorResult = await executor.executeStep(step, { workspace: workspacePath, dryRun: false, logs: [], confirmedSteps: new Set() });
        expect(result.success).toBe(true);
      }

      const executionTime = Date.now() - startTime;
      console.log(`Data extraction completed in ${executionTime}ms`);
      
      // Performance target: under 15 seconds for data extraction
      expect(executionTime).toBeLessThan(15000);
    }, 20000);
  });

  describe('Component Performance', () => {
    it('should create plans quickly', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        const plan = await planner.createPlan('organize files', '/test');
        expect(plan.steps.length).toBeGreaterThan(0);
      }

      const planningTime = Date.now() - startTime;
      const avgTimePerPlan = planningTime / 100;
      
      console.log(`Average planning time: ${avgTimePerPlan}ms`);
      
      // Should be able to create plans in under 50ms average
      expect(avgTimePerPlan).toBeLessThan(50);
    });

    it('should perform safety checks efficiently', () => {
      const testStep = {
        id: 'test-step',
        type: 'readFiles' as const,
        description: 'Test step',
        params: { extensions: ['.txt', '.md'] },
        timeout: 5000,
        requiresConfirmation: false
      };

      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        const result = safety.checkStep(testStep);
        expect(result).toBeDefined();
      }

      const safetyTime = Date.now() - startTime;
      const avgTimePerCheck = safetyTime / 1000;
      
      console.log(`Average safety check time: ${avgTimePerCheck}ms`);
      
      // Should perform safety checks in under 1ms average
      expect(avgTimePerCheck).toBeLessThan(1);
    });
  });

  describe('Memory Usage', () => {
    it('should handle large numbers of files without memory issues', async () => {
      // Create many files to test memory usage
      const fileCount = 100;
      for (let i = 0; i < fileCount; i++) {
        await workspace.createFile(`file${i}.txt`, `Content of file ${i}`);
      }

      const startTime = Date.now();
      
      const plan = await planner.createPlan('organize this folder', workspacePath);
      expect(plan.steps.length).toBeGreaterThan(0);

      for (const step of plan.steps) {
        const result: ExecutorResult = await executor.executeStep(step, { workspace: workspacePath, dryRun: false, logs: [], confirmedSteps: new Set() });
        expect(result.success).toBe(true);
      }

      const executionTime = Date.now() - startTime;
      console.log(`Processed ${fileCount} files in ${executionTime}ms`);
      
      // Should handle 100 files in under 60 seconds
      expect(executionTime).toBeLessThan(60000);
    }, 65000);
  });

  describe('Stress Testing', () => {
    it('should handle concurrent planning requests', async () => {
      const startTime = Date.now();
      
      const promises = Array.from({ length: 50 }, (_, i) => 
        planner.createPlan(`organize files ${i}`, '/test')
      );

      const plans = await Promise.all(promises);
      expect(plans).toHaveLength(50);
      plans.forEach(plan => {
        expect(plan.steps.length).toBeGreaterThan(0);
      });

      const concurrentTime = Date.now() - startTime;
      console.log(`Concurrent planning (50 requests) completed in ${concurrentTime}ms`);
      
      // Should handle 50 concurrent plans in under 5 seconds
      expect(concurrentTime).toBeLessThan(5000);
    });
  });
});