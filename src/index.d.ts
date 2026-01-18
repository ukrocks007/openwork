#!/usr/bin/env node
import { TaskSummary } from './types/index.js';
declare class CoworkLite {
    private planner;
    private executor;
    constructor();
    run(goal: string, workspace: string, options?: {
        dryRun?: boolean;
    }): Promise<TaskSummary>;
}
export { CoworkLite };
//# sourceMappingURL=index.d.ts.map