import { describe, it, expect, beforeEach } from '@jest/globals';
import { Planner } from '../src/planner/index';
import type { PlannerConfig } from '../src/types/index';

describe('Planner', () => {
  let planner: Planner;
  let config: PlannerConfig;

  beforeEach(() => {
    config = {
      maxSteps: 10,
      timeout: 300000,
      allowedOperations: ['readFiles', 'writeFile', 'createFolder', 'extractData', 'generateReport']
    };
    planner = new Planner(config);
  });

  describe('createPlan', () => {
    it('should create a plan for file organization task', async () => {
      const goal = 'organize this folder of receipts into categories';
      const workspace = '/test/workspace';

      const plan = await planner.createPlan(goal, workspace);

      expect(plan).toBeDefined();
      expect(plan.goal).toBe(goal);
      expect(plan.workspace).toBe(workspace);
      expect(plan.steps).toHaveLength(3);
      expect(plan.id).toBeDefined();
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    it('should create a plan for report generation task', async () => {
      const goal = 'generate a summary report from these meeting notes';
      const workspace = '/test/workspace';

      const plan = await planner.createPlan(goal, workspace);

      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[0]?.type).toBe('readFiles');
      expect(plan.steps[1]?.type).toBe('generateReport');
      expect(plan.steps[2]?.type).toBe('writeFile');
    });

    it('should create a plan for data extraction task', async () => {
      const goal = 'extract data from CSV files';
      const workspace = '/test/workspace';

      const plan = await planner.createPlan(goal, workspace);

      expect(plan.steps).toHaveLength(3);
      expect(plan.steps[0]?.type).toBe('readFiles');
      expect(plan.steps[1]?.type).toBe('extractData');
      expect(plan.steps[2]?.type).toBe('writeFile');
    });

    it('should return empty plan for unrecognized task', async () => {
      const goal = 'do something unknown';
      const workspace = '/test/workspace';

      const plan = await planner.createPlan(goal, workspace);

      expect(plan.steps).toHaveLength(0);
    });

    it('should limit steps to maxSteps from config', async () => {
      const configWithLimit: PlannerConfig = {
        maxSteps: 2,
        timeout: 300000,
        allowedOperations: ['readFiles', 'writeFile', 'createFolder']
      };
      const limitedPlanner = new Planner(configWithLimit);

      const plan = await limitedPlanner.createPlan('organize receipts', '/workspace');

      expect(plan.steps.length).toBeLessThanOrEqual(2);
    });

    it('should generate unique IDs for steps', async () => {
      const plan1 = await planner.createPlan('organize receipts', '/workspace1');
      const plan2 = await planner.createPlan('organize receipts', '/workspace2');

      plan1.steps.forEach(step => {
        expect(step.id).toBeDefined();
        expect(step.id).toMatch(/^[a-z0-9]{9}$/);
      });

      // Check for uniqueness across plans
      const allIds = [...plan1.steps, ...plan2.steps].map(s => s.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should set appropriate timeouts for each step', async () => {
      const plan = await planner.createPlan('organize receipts', '/workspace');

      plan.steps.forEach(step => {
        expect(step.timeout).toBeDefined();
        expect(step.timeout).toBeGreaterThan(0);
      });

      // readFiles should have shorter timeout than generateReport
      const readFilesStep = plan.steps.find(s => s.type === 'readFiles');
      const generateReportStep = plan.steps.find(s => s.type === 'generateReport');
      
      if (readFilesStep && generateReportStep) {
        expect(readFilesStep.timeout).toBeLessThan(generateReportStep.timeout!);
      }
    });

    it('should mark destructive steps as requiring confirmation', async () => {
      const orgPlan = await planner.createPlan('organize receipts', '/workspace');
      const reportPlan = await planner.createPlan('generate a report', '/workspace');

      const createFolderStep = orgPlan.steps.find(s => s.type === 'createFolder');
      const writeFileStep = reportPlan.steps.find(s => s.type === 'writeFile');
      const readFilesStep = orgPlan.steps.find(s => s.type === 'readFiles');

      expect(createFolderStep?.requiresConfirmation).toBe(true);
      expect(writeFileStep?.requiresConfirmation).toBe(true);
      expect(readFilesStep?.requiresConfirmation).toBe(false);
    });
  });

  describe('Step Generation', () => {
    it('should generate organization steps correctly', async () => {
      const steps = await (planner as any).generateSteps('organize receipts', '/workspace');

      expect(steps).toHaveLength(3);
      expect(steps[0].type).toBe('readFiles');
      expect(steps[1].type).toBe('extractData');
      expect(steps[2].type).toBe('createFolder');
    });

    it('should generate report steps correctly', async () => {
      const steps = await (planner as any).generateSteps('generate report', '/workspace');

      expect(steps).toHaveLength(3);
      expect(steps[0].type).toBe('readFiles');
      expect(steps[1].type).toBe('generateReport');
      expect(steps[2].type).toBe('writeFile');
    });

    it('should generate extraction steps correctly', async () => {
      const steps = await (planner as any).generateSteps('extract data', '/workspace');

      expect(steps).toHaveLength(3);
      expect(steps[0].type).toBe('readFiles');
      expect(steps[1].type).toBe('extractData');
      expect(steps[2].type).toBe('writeFile');
    });
  });

  describe('Task Plan Structure', () => {
    it('should calculate estimated duration correctly', async () => {
      const plan = await planner.createPlan('organize receipts', '/workspace');
      
      const expectedDuration = plan.steps.reduce((total, step) => total + (step.timeout ?? 0), 0);
      expect(plan.estimatedDuration).toBe(expectedDuration);
    });

    it('should include meaningful descriptions for each step', async () => {
      const plan = await planner.createPlan('organize receipts', '/workspace');

      plan.steps.forEach(step => {
        expect(step.description).toBeDefined();
        expect(step.description.length).toBeGreaterThan(0);
        expect(typeof step.description).toBe('string');
      });
    });

    it('should include proper parameters for each step', async () => {
      const plan = await planner.createPlan('organize receipts', '/workspace');

      plan.steps.forEach(step => {
        expect(step.params).toBeDefined();
        expect(typeof step.params).toBe('object');
      });

      // Check specific step parameters
      const readFilesStep = plan.steps.find(s => s.type === 'readFiles');
      expect(readFilesStep?.params).toHaveProperty('path');

      const createFolderStep = plan.steps.find(s => s.type === 'createFolder');
      expect(createFolderStep?.params).toHaveProperty('folders');
    });
  });
});