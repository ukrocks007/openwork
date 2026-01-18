import { TaskPlan, PlannerConfig } from '../types/index.js';
export declare class Planner {
    private config;
    constructor(config: PlannerConfig);
    createPlan(goal: string, workspace: string): Promise<TaskPlan>;
    private generateSteps;
    private generateOrganizationSteps;
    private generateReportSteps;
    private generateExtractionSteps;
    private estimateDuration;
    private generateId;
}
//# sourceMappingURL=index.d.ts.map