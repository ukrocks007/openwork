import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export class TestWorkspace {
  private workspacePath: string;

  constructor() {
    this.workspacePath = join(tmpdir(), `cowork-test-${Date.now()}`);
  }

  async setup(): Promise<string> {
    await fs.mkdir(this.workspacePath, { recursive: true });
    return this.workspacePath;
  }

  async createFile(filename: string, content: string = 'test content'): Promise<void> {
    const filePath = join(this.workspacePath, filename);
    await fs.writeFile(filePath, content);
  }

  async createFolder(folderName: string): Promise<void> {
    const folderPath = join(this.workspacePath, folderName);
    await fs.mkdir(folderPath, { recursive: true });
  }

  async readFile(filename: string): Promise<string> {
    const filePath = join(this.workspacePath, filename);
    return await fs.readFile(filePath, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(join(this.workspacePath, path));
      return true;
    } catch {
      return false;
    }
  }

  async listContents(): Promise<string[]> {
    return await fs.readdir(this.workspacePath);
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workspacePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  getPath(): string {
    return this.workspacePath;
  }
}

export const createTestWorkspace = (): TestWorkspace => new TestWorkspace();