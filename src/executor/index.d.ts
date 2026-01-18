import { TaskStep, ExecutorResult, ExecutionContext } from '../types/index.js';
export declare class Executor {
    private safety;
    constructor();
    executeStep(step: TaskStep, context: ExecutionContext): Promise<ExecutorResult>;
    private executeReadFiles;
    private executeWriteFile;
    private executeCreateFolder;
    private executeExtractData;
    private executeGenerateReport;
}
//# sourceMappingURL=index.d.ts.map