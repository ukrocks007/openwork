export interface TaskStep {
    id: string;
    type: 'readFiles' | 'writeFile' | 'renameFile' | 'createFolder' | 'extractData' | 'generateReport' | 'browserAction';
    description: string;
    params: Record<string, any>;
    requiresConfirmation?: boolean;
    timeout?: number;
}
export interface TaskPlan {
    id: string;
    goal: string;
    workspace: string;
    steps: TaskStep[];
    estimatedDuration?: number;
}
export interface ExecutionContext {
    workspace: string;
    dryRun: boolean;
    logs: string[];
    confirmedSteps: Set<string>;
}
export interface SafetyCheck {
    isDestructive: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    warnings: string[];
    requiresConfirmation: boolean;
}
export interface PlannerConfig {
    maxSteps: number;
    timeout: number;
    allowedOperations: string[];
}
export interface ExecutorResult {
    stepId: string;
    success: boolean;
    output?: any;
    error?: string;
    duration: number;
}
export interface TaskSummary {
    planId: string;
    goal: string;
    totalSteps: number;
    completedSteps: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
    results: ExecutorResult[];
}
//# sourceMappingURL=index.d.ts.map