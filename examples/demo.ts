import { CoworkLite } from '../src/index.js';

async function demo() {
  const cowork = new CoworkLite();
  
  // Create demo workspace
  const demoWorkspace = './demo-workspace';
  
  console.log('🚀 Cowork Lite Demo\\n');
  
  // Example 1: File organization (dry run)
  console.log('=== Example 1: File Organization (Dry Run) ===');
  await cowork.run('organize this folder and create organized structure', demoWorkspace, { dryRun: true });
  
  console.log('\\n=== Example 2: Report Generation ===');
  await cowork.run('generate a summary report from this workspace', demoWorkspace, { dryRun: true });
}

demo().catch(console.error);