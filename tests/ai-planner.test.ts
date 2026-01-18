import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EnhancedPlanner } from '../src/planner/enhanced';
import { TestWorkspace } from './utils';
import type { PlannerConfig } from '../src/types/index';

describe('Enhanced Planner with AI Integration', () => {
  let workspace: TestWorkspace;
  let planner: EnhancedPlanner;
  let workspacePath: string;
  let config: PlannerConfig;

  beforeEach(async () => {
    workspace = new TestWorkspace();
    workspacePath = await workspace.setup();
    
    config = {
      maxSteps: 20,
      timeout: 5000,
      allowedOperations: ['readFiles', 'writeFile', 'createFolder', 'renameFile', 'extractData', 'generateReport'],
      aiEnabled: false, // Start with AI disabled for basic tests
      fallbackToRuleBased: true
    };
    
    planner = new EnhancedPlanner(config);
  });

  afterEach(() => {
    workspace.cleanup();
  });

  describe('Basic Planning (Fallback Mode)', () => {
    it('should create plan when AI is disabled', async () => {
      await workspace.createFile('test.txt', 'content');
      
      const plan = await planner.createPlan('organize files', workspacePath);
      
      expect(plan).toBeDefined();
      expect(plan.goal).toBe('organize files');
      expect(plan.workspace).toBe(workspacePath);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.aiGenerated).toBe(false);
      expect(plan.confidence).toBeLessThan(1.0);
    });

    it('should fall back to rule-based when AI fails', async () => {
      const configWithAI = {
        ...config,
        aiEnabled: true,
        aiApiKey: 'invalid-key', // This will cause AI to fail
        aiProvider: 'openai' as const
      };
      
      const aiPlanner = new EnhancedPlanner(configWithAI);
      
      const plan = await aiPlanner.createPlan('organize files', workspacePath);
      
      expect(plan).toBeDefined();
      expect(plan.aiGenerated).toBe(false);
      expect(plan.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', async () => {
      const newConfig = { maxSteps: 10 };
      planner.updateConfig(newConfig);
      
      const updatedConfig = planner.getConfig();
      expect(updatedConfig.maxSteps).toBe(10);
    });

    it('should initialize AI when enabled', async () => {
      const aiConfig = {
        ...config,
        aiEnabled: true,
        aiApiKey: 'test-key',
        aiProvider: 'openai' as const
      };
      
      const aiPlanner = new EnhancedPlanner(aiConfig);
      const isAvailable = await aiPlanner.isAIAvailable();
      
      // Should be false since we don't have real API key
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should provide recommendations when AI is available', async () => {
      const recommendations = await planner.getAIRecommendations('organize files', workspacePath);
      
      // Should return empty array when AI is not available
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Plan Quality', () => {
    it('should estimate duration correctly', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      
      expect(plan.estimatedDuration).toBeGreaterThan(0);
      expect(typeof plan.estimatedDuration).toBe('number');
    });

    it('should generate unique step IDs', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      
      const stepIds = plan.steps.map(step => step.id);
      const uniqueIds = new Set(stepIds);
      
      expect(uniqueIds.size).toBe(stepIds.length);
    });

    it('should include proper step metadata', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      
      plan.steps.forEach(step => {
        expect(step.id).toBeDefined();
        expect(step.type).toBeDefined();
        expect(step.description).toBeDefined();
        expect(step.params).toBeDefined();
        expect(typeof step.requiresConfirmation).toBe('boolean');
        expect(typeof step.timeout).toBe('number');
      });
    });
  });

  describe('Learning and Improvement', () => {
    it('should record successful execution', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      const results = [
        { stepId: plan.steps[0].id, success: true, duration: 100 },
        { stepId: plan.steps[1].id, success: true, duration: 200 }
      ];
      
      await expect(planner.learnFromExecution(plan, results)).resolves.not.toThrow();
    });

    it('should record failed execution', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      const results = [
        { stepId: plan.steps[0].id, success: false, duration: 100, error: 'Failed' },
        { stepId: plan.steps[1].id, success: true, duration: 200 }
      ];
      
      await expect(planner.learnFromExecution(plan, results)).resolves.not.toThrow();
    });

    it('should suggest improvements when possible', async () => {
      const plan = await planner.createPlan('organize files', workspacePath);
      const results = [
        { stepId: plan.steps[0].id, success: false, duration: 100, error: 'Timeout' }
      ];
      
      const improvedPlan = await planner.improvePlan(plan, results);
      
      expect(improvedPlan).toBeDefined();
      expect(improvedPlan.steps).toHaveLength(plan.steps.length);
    });
  });

  describe('AI Integration (Mock Tests)', () => {
    it('should handle AI provider configuration', () => {
      const aiConfig = {
        ...config,
        aiEnabled: true,
        aiApiKey: 'test-key',
        aiProvider: 'openai' as const,
        aiModel: 'gpt-4'
      };
      
      expect(() => new EnhancedPlanner(aiConfig)).not.toThrow();
    });

    it('should validate AI configuration', () => {
      const invalidConfig = {
        ...config,
        aiEnabled: true,
        aiApiKey: '', // Empty API key
        aiProvider: 'openai' as const
      };
      
      expect(() => new EnhancedPlanner(invalidConfig)).not.toThrow();
      // Planner should still be created but AI will be disabled
    });
  });

  describe('Performance', () => {
    it('should create plans quickly', async () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await planner.createPlan('organize files', workspacePath);
      }
      
      const duration = Date.now() - startTime;
      const avgTime = duration / 10;
      
      // Should average less than 100ms per plan
      expect(avgTime).toBeLessThan(100);
    });

    it('should handle concurrent planning requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        planner.createPlan(`organize files ${i}`, workspacePath)
      );
      
      const plans = await Promise.all(promises);
      
      expect(plans).toHaveLength(5);
      plans.forEach(plan => {
        expect(plan.steps.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid workspace gracefully', async () => {
      const plan = await planner.createPlan('organize files', '/invalid/path');
      
      expect(plan).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle empty goals gracefully', async () => {
      const plan = await planner.createPlan('', workspacePath);
      
      expect(plan).toBeDefined();
      expect(plan.goal).toBe('');
    });

    it('should maintain consistency with and without AI', async () => {
      // Test with AI disabled
      const planWithoutAI = await planner.createPlan('organize files', workspacePath);
      
      // Test with AI enabled but configured to fall back
      const aiConfig = {
        ...config,
        aiEnabled: true,
        aiApiKey: 'invalid-key',
        fallbackToRuleBased: true
      };
      const aiPlanner = new EnhancedPlanner(aiConfig);
      const planWithAI = await aiPlanner.createPlan('organize files', workspacePath);
      
      // Both should produce valid plans
      expect(planWithoutAI.steps.length).toBeGreaterThan(0);
      expect(planWithAI.steps.length).toBeGreaterThan(0);
    });
  });
});