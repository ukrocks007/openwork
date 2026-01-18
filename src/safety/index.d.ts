import { TaskStep, SafetyCheck } from '../types/index.js';
export declare class SafetyLayer {
    checkStep(step: TaskStep): SafetyCheck;
    requestConfirmation(step: TaskStep): Promise<boolean>;
    private assessRiskLevel;
    private generateWarnings;
    private promptUser;
    createDryRunLog(step: TaskStep): string;
}
//# sourceMappingURL=index.d.ts.map