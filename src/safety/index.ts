import { TaskStep, SafetyCheck } from '../types/index.js';

export class SafetyLayer {
  checkStep(step: TaskStep): SafetyCheck {
    const destructiveOperations = ['writeFile', 'renameFile', 'deleteFile', 'createFolder'];
    const isDestructive = destructiveOperations.includes(step.type);
    
    return {
      isDestructive,
      riskLevel: this.assessRiskLevel(step),
      warnings: this.generateWarnings(step),
      requiresConfirmation: isDestructive || Boolean(step.requiresConfirmation)
    };
  }

  async requestConfirmation(step: TaskStep): Promise<boolean> {
    const safetyCheck = this.checkStep(step);
    
    if (!safetyCheck.requiresConfirmation) {
      return true;
    }

    console.log(`\\n⚠️  Step requires confirmation: ${step.description}`);
    console.log(`Risk Level: ${safetyCheck.riskLevel}`);
    
    if (safetyCheck.warnings.length > 0) {
      console.log('Warnings:');
      safetyCheck.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    const response = await this.promptUser('Proceed with this step? (y/N): ');
    return response.toLowerCase() === 'y' || response.toLowerCase() === 'yes';
  }

  private assessRiskLevel(step: TaskStep): 'low' | 'medium' | 'high' {
    if (step.type === 'readFiles') return 'low';
    if (step.type === 'extractData') return 'low';
    if (step.type === 'generateReport') return 'medium';
    if (step.type === 'createFolder') return 'medium';
    if (['writeFile', 'renameFile'].includes(step.type)) return 'high';
    return 'medium';
  }

  private generateWarnings(step: TaskStep): string[] {
    const warnings: string[] = [];
    
    if (step.type === 'writeFile') {
      warnings.push('This will create or overwrite a file');
    }
    
    if (step.type === 'renameFile') {
      warnings.push('This will rename a file');
    }
    
    if (step.type === 'createFolder') {
      warnings.push('This will create a new directory');
    }
    
    return warnings;
  }

  private async promptUser(question: string): Promise<string> {
    process.stdout.write(question);
    return new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve(data.toString().trim());
      });
    });
  }

  createDryRunLog(step: TaskStep): string {
    const safetyCheck = this.checkStep(step);
    return `[DRY RUN] ${step.type}: ${step.description} (Risk: ${safetyCheck.riskLevel})`;
  }
}