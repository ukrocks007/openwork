import { TaskStep, ExecutorResult, ExecutionContext } from '../types/index.js';
import { SafetyLayer } from '../safety/index.js';
import { SmartFileAnalyzer } from '../analysis/file-analyzer.js';
import { 
  ErrorFactory, 
  CoworkError
} from '../error/index.js';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

export class Executor {
  private safety: SafetyLayer;
  private fileAnalyzer: SmartFileAnalyzer;

  constructor() {
    this.safety = new SafetyLayer();
    this.fileAnalyzer = new SmartFileAnalyzer();
  }

  async executeStep(step: TaskStep, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();
    
    try {
      // Safety check
      const safetyCheck = this.safety.checkStep(step);
      
      if (context.dryRun) {
        console.log(this.safety.createDryRunLog(step));
        return {
          stepId: step.id,
          success: true,
          duration: Date.now() - startTime
        };
      }

      if (safetyCheck.requiresConfirmation) {
        const confirmed = await this.safety.requestConfirmation(step);
        if (!confirmed) {
          return {
            stepId: step.id,
            success: false,
            error: 'User cancelled the operation',
            duration: Date.now() - startTime
          };
        }
      }

      let result;
      switch (step.type) {
        case 'readFiles':
          result = await this.executeReadFiles(step, context);
          break;
        case 'writeFile':
          result = await this.executeWriteFile(step, context);
          break;
        case 'createFolder':
          result = await this.executeCreateFolder(step, context);
          break;
        case 'renameFile':
          result = await this.executeRenameFile(step, context);
          break;
        case 'extractData':
          result = await this.executeExtractData(step, context);
          break;
        case 'generateReport':
          result = await this.executeGenerateReport(step, context);
          break;
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      return {
        stepId: step.id,
        success: true,
        output: result,
        duration: Date.now() - startTime
      };

    } catch (error) {
      const coworkError = this.handleError(error, step, context);
      context.logs.push(`❌ ${step.description}: ${coworkError.message}`);
      
      return {
        stepId: step.id,
        success: false,
        error: coworkError.userFriendly ? coworkError.message : coworkError.toString(),
        duration: Date.now() - startTime
      };
    }
  }

  private handleError(error: any, step: TaskStep, context: ExecutionContext): CoworkError {
    if (error instanceof CoworkError) {
      return error;
    }

    return ErrorFactory.fromException(error, `executeStep:${step.type}`, {
      step: step.id,
      workspace: context.workspace,
      additionalData: {
        stepType: step.type,
        stepDescription: step.description,
        stepParams: step.params
      }
    });
  }

  private async executeReadFiles(step: TaskStep, context: ExecutionContext): Promise<any> {
    const path = resolve(context.workspace, step.params.path || '.');
    const extensions = step.params.extensions;
    
    const files = await fs.readdir(path, { withFileTypes: true });
    
    let fileList = files.filter(file => file.isFile());
    
    if (extensions) {
      fileList = fileList.filter(file => 
        extensions.some((ext: string) => file.name.endsWith(ext))
      );
    }

    return {
      path,
      files: fileList.map(f => ({
        name: f.name,
        path: join(path, f.name)
      }))
    };
  }

  private async executeWriteFile(step: TaskStep, context: ExecutionContext): Promise<any> {
    const filename = step.params.filename || 'output.txt';
    const content = step.params.content || '';
    const filePath = join(context.workspace, filename);
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    return {
      filename,
      path: filePath,
      bytesWritten: Buffer.byteLength(content, 'utf-8')
    };
  }

  private async executeCreateFolder(step: TaskStep, context: ExecutionContext): Promise<any> {
    const folders = step.params.folders || [];
    const createdFolders = [];
    
    for (const folder of folders) {
      const folderPath = join(context.workspace, folder);
      await fs.mkdir(folderPath, { recursive: true });
      createdFolders.push(folderPath);
    }
    
    return { createdFolders };
  }

  private async executeRenameFile(step: TaskStep, context: ExecutionContext): Promise<any> {
    const pattern = step.params.pattern;
    const destination = step.params.destination;
    
    // Simplified implementation - in real version would use glob patterns
    const sourcePath = join(context.workspace, pattern);
    const destPath = join(context.workspace, destination);
    
    await fs.rename(sourcePath, destPath);
    
    return {
      source: sourcePath,
      destination: destPath
    };
  }

  private async executeExtractData(step: TaskStep, context: ExecutionContext): Promise<any> {
    const workspace = resolve(context.workspace, step.params.path || '.');
    
    // Analyze all files in workspace
    const analyzedFiles = await this.fileAnalyzer.analyzeDirectory(workspace);
    
    // Categorize files (using basic categorization for now)
    const categories = await this.fileAnalyzer.categorizeFiles(analyzedFiles);
    
    // Find duplicates
    const duplicates = this.fileAnalyzer.findDuplicates(analyzedFiles);
    
    return {
      extractedData: {
        totalFiles: analyzedFiles.length,
        categories: Object.fromEntries(categories.entries()),
        duplicates: duplicates.length
      },
      summary: `Analysis complete: ${analyzedFiles.length} files analyzed`
    };
  }

  private async executeGenerateReport(step: TaskStep, context: ExecutionContext): Promise<any> {
    const goal = step.params.goal || 'Generate report';
    
    // Get basic file analysis
    const analyzedFiles = await this.fileAnalyzer.analyzeDirectory(context.workspace);
    const categories = await this.fileAnalyzer.categorizeFiles(analyzedFiles);
    
    // Generate basic markdown report
    let content = `# Workspace Analysis Report\\n\\n`;
    content += `**Generated on:** ${new Date().toISOString()}\\n`;
    content += `**Goal:** ${goal}\\n\\n`;
    content += `**Total Files:** ${analyzedFiles.length}\\n`;
    content += `**Categories:** ${categories.size}\\n\\n`;
    
    // Save report if path provided
    if (step.params.outputPath) {
      const outputPath = resolve(context.workspace, step.params.outputPath);
      await fs.writeFile(outputPath, content);
      console.log(`📄 Report saved to: ${outputPath}`);
    }
    
    return {
      content,
      title: 'Workspace Analysis Report',
      format: 'markdown'
    };
  }
}