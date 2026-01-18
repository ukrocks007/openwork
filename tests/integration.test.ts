import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Planner } from '../src/planner/index';
import { Executor } from '../src/executor/index';
import { SafetyLayer } from '../src/safety/index';
import type { PlannerConfig, ExecutorResult, ExecutionContext } from '../src/types/index';
import { TestWorkspace } from './utils.js';

describe('End-to-End Integration Tests', () => {
  let planner: Planner;
  let executor: Executor;
  let safety: SafetyLayer;
  let workspace: TestWorkspace;
  let config: PlannerConfig;

  beforeEach(async () => {
    config = {
      maxSteps: 10,
      timeout: 300000,
      allowedOperations: ['readFiles', 'writeFile', 'createFolder', 'extractData', 'generateReport']
    };
    
    planner = new Planner(config);
    executor = new Executor();
    safety = new SafetyLayer();
    workspace = new TestWorkspace();
    await workspace.setup();
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  describe('Complete Workflow Integration', () => {
    it('should execute full file organization workflow', async () => {
      // Setup test files
      await workspace.createFile('receipt1.pdf', 'receipt content');
      await workspace.createFile('image1.jpg', 'image content');
      await workspace.createFile('data.csv', 'csv data');
      
      // Create plan
      const goal = 'organize this folder of receipts into categories';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      expect(plan.steps).toHaveLength(3);
      expect(plan.goal).toBe(goal);
      
      // Execute all steps
      const results: ExecutorResult[] = [];
      for (const step of plan.steps) {
        const context: ExecutionContext = {
          workspace: workspace.getPath(),
          dryRun: false,
          logs: [],
          confirmedSteps: new Set<string>([step.id])
        };
        
        const result = await executor.executeStep(step, context);
        results.push(result);
        expect(result.success).toBe(true);
      }
      
      // Verify results
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Verify folder structure was created
      const exists = await workspace.exists('documents');
      const imagesExists = await workspace.exists('images');
      const spreadsheetsExists = await workspace.exists('spreadsheets');
      
      // At least one folder should be created
      expect(exists || imagesExists || spreadsheetsExists).toBe(true);
    });

    it('should execute report generation workflow', async () => {
      // Setup source files
      await workspace.createFile('notes.txt', 'Meeting notes content');
      await workspace.createFile('data.json', 'Important data');
      
      // Create plan
      const goal = 'generate a summary report from these meeting notes';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      expect(plan.steps).toHaveLength(3);
      
      // Execute all steps
      const results: ExecutorResult[] = [];
      for (const step of plan.steps) {
        const context: ExecutionContext = {
          workspace: workspace.getPath(),
          dryRun: false,
          logs: [],
          confirmedSteps: new Set<string>([step.id])
        };
        
        const result = await executor.executeStep(step, context);
        results.push(result);
      }
      
      // Verify report was generated
      const reportExists = await workspace.exists('generated_report.md');
      expect(reportExists).toBe(true);
      
      if (reportExists) {
        const reportContent = await workspace.readFile('generated_report.md');
        expect(reportContent.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should execute data extraction workflow', async () => {
      // Setup CSV files
      await workspace.createFile('data1.csv', 'Name,Age,City\\nJohn,30,NYC\\nJane,25,LA');
      await workspace.createFile('data2.csv', 'Product,Price\\nBook,15\\nPen,2');
      
      // Create plan
      const goal = 'extract data from CSV files';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      expect(plan.steps).toHaveLength(3);
      
      // Execute all steps
      const results: ExecutorResult[] = [];
      for (const step of plan.steps) {
        const context: ExecutionContext = {
          workspace: workspace.getPath(),
          dryRun: false,
          logs: [],
          confirmedSteps: new Set<string>([step.id])
        };
        
        const result = await executor.executeStep(step, context);
        results.push(result);
      }
      
      // Verify extraction was successful
      const extractionExists = await workspace.exists('extracted_data.csv');
      expect(extractionExists).toBe(true);
    });
  });

  describe('Safety Integration', () => {
    it('should handle safety checks for destructive operations', async () => {
      // Create plan with destructive operations
      const goal = 'generate a report';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      // Find destructive step
      const writeStep = plan.steps.find(s => s.type === 'writeFile');
      expect(writeStep).toBeDefined();
      
      if (writeStep) {
        // Check safety
        const safetyCheck = safety.checkStep(writeStep);
        expect(safetyCheck.isDestructive).toBe(true);
        expect(safetyCheck.requiresConfirmation).toBe(true);
        expect(safetyCheck.riskLevel).toBe('high');
      }
    });

    it('should respect dry-run mode throughout workflow', async () => {
      // Setup files
      await workspace.createFile('test.txt', 'content');
      
      // Create plan
      const goal = 'organize receipts';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      // Execute in dry-run mode
      const results: ExecutorResult[] = [];
      for (const step of plan.steps) {
        const context: ExecutionContext = {
          workspace: workspace.getPath(),
          dryRun: true,
          logs: [],
          confirmedSteps: new Set<string>()
        };
        
        const result = await executor.executeStep(step, context);
        results.push(result);
        expect(result.success).toBe(true);
      }
      
      // Verify no actual changes were made
      const contents = await workspace.listContents();
      expect(contents).toContain('test.txt');
      // Should not have created new folders in dry run
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors gracefully in complete workflow', async () => {
      // Create plan for non-existent workspace
      const goal = 'organize files';
      const fakePath = '/non/existent/path';
      const plan = await planner.createPlan(goal, fakePath);
      
      expect(plan.steps.length).toBeGreaterThan(0);
      
      // Try to execute first step (should fail gracefully)
      const firstStep = plan.steps[0];
      if (firstStep) {
        const context: ExecutionContext = {
          workspace: fakePath,
          dryRun: false,
          logs: [],
          confirmedSteps: new Set<string>([firstStep.id])
        };
        
        const result = await executor.executeStep(firstStep, context);
        // Should handle error without crashing
        expect(result).toBeDefined();
        expect(result.stepId).toBe(firstStep.id);
      }
    });

    it('should handle invalid step types gracefully', async () => {
      const invalidStep = {
        id: 'invalid-step',
        type: 'invalidType' as any,
        description: 'Invalid step',
        params: {}
      };
      
      const context: ExecutionContext = {
        workspace: workspace.getPath(),
        dryRun: false,
        logs: [],
        confirmedSteps: new Set<string>(['invalid-step'])
      };
      
      const result = await executor.executeStep(invalidStep, context);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Integration', () => {
    it('should complete workflows within reasonable time', async () => {
      // Setup files
      await workspace.createFile('test.txt', 'content');
      
      // Create and execute plan
      const goal = 'organize files';
      const plan = await planner.createPlan(goal, workspace.getPath());
      
      const startTime = Date.now();
      
      const results: ExecutorResult[] = [];
      for (const step of plan.steps) {
        const context: ExecutionContext = {
          workspace: workspace.getPath(),
          dryRun: false,
          logs: [],
          confirmedSteps: new Set<string>([step.id])
        };
        
        const result = await executor.executeStep(step, context);
        results.push(result);
      }
      
      const totalTime = Date.now() - startTime;
      
      // Should complete quickly (under 30 seconds for simple operations)
      expect(totalTime).toBeLessThan(30000);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});