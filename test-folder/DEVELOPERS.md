# Developer Documentation

## Architecture Overview

Cowork Lite is a modular task automation platform built with TypeScript and Node.js. The system follows a clean architecture pattern with separate concerns for planning, execution, and safety.

### Core Modules

#### 1. Types Module (`src/types/index.ts`)
Defines all interfaces and types used throughout the application:
- `TaskStep`: Represents a single operation to be executed
- `TaskPlan`: Collection of steps to achieve a goal
- `ExecutionContext`: Runtime context for execution
- `SafetyCheck`: Risk assessment results
- `PlannerConfig`: Configuration for planning behavior
- `ExecutorResult`: Results from step execution

#### 2. Planner Module (`src/planner/index.ts`)
Converts high-level goals into executable task plans:
- Rule-based task planning using pattern matching
- Support for file organization, report generation, and data extraction
- Step ordering and validation
- Configurable limits and timeouts

**Key Methods:**
- `createPlan(goal: string, workspace: string): Promise<TaskPlan>`
- `generateSteps(goal: string, workspace: string): Promise<TaskStep[]>`

#### 3. Safety Layer (`src/safety/index.ts`)
Ensures safe execution of operations:
- Risk assessment (low/medium/high)
- Dry-run mode support
- User confirmation prompts for destructive operations
- Warning generation for potentially unsafe actions

**Key Methods:**
- `checkStep(step: TaskStep): SafetyCheck`
- `requestConfirmation(step: TaskStep): Promise<boolean>`
- `createDryRunLog(step: TaskStep): string`

#### 4. Executor Module (`src/executor/index.ts`)
Executes individual task steps:
- File system operations (read, write, create folders)
- Data extraction and report generation
- Error handling and logging
- Integration with safety checks

**Key Methods:**
- `executeStep(step: TaskStep, context: ExecutionContext): Promise<ExecutorResult>`
- `readFiles`, `writeFile`, `createFolder`, `extractData`, `generateReport`

#### 5. CLI Interface (`src/index.ts`)
Command-line interface and application entry point:
- Argument parsing and validation
- Interactive execution flow
- Progress reporting
- Error handling

## Getting Started

### Prerequisites
- Node.js 18+
- TypeScript 5+
- npm or yarn

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd cowork-lite

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Development Commands
```bash
# Development mode with TypeScript
npm run dev -- "your task" ./workspace

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode for tests
npm run test:watch
```

## API Reference

### Planner Class

```typescript
class Planner {
  constructor(config: PlannerConfig)
  async createPlan(goal: string, workspace: string): Promise<TaskPlan>
}
```

**Configuration:**
```typescript
interface PlannerConfig {
  maxSteps: number;
  timeout: number;
  allowedOperations: string[];
}
```

**Supported Task Types:**
- **File Organization**: Goals containing "organize" or "sort"
- **Report Generation**: Goals containing "report" or "summary"
- **Data Extraction**: Goals containing "extract" or "process"

### Executor Class

```typescript
class Executor {
  async executeStep(step: TaskStep, context: ExecutionContext): Promise<ExecutorResult>
}
```

**Step Types:**
- `readFiles`: Read files from workspace with optional filtering
- `writeFile`: Write content to a file
- `createFolder`: Create directory structure
- `renameFile`: Move/rename files
- `extractData`: Extract structured data from files
- `generateReport`: Create summary reports

### SafetyLayer Class

```typescript
class SafetyLayer {
  checkStep(step: TaskStep): SafetyCheck
  async requestConfirmation(step: TaskStep): Promise<boolean>
  createDryRunLog(step: TaskStep): string
}
```

**Risk Levels:**
- `low`: Non-destructive operations (readFiles, extractData)
- `medium`: Potentially disruptive operations (generateReport, createFolder)
- `high`: Destructive operations (writeFile, renameFile)

## Testing

### Test Structure
- **Unit Tests**: Individual module testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Benchmarking and stress testing

### Test Utilities
```typescript
// Test workspace management
import { TestWorkspace } from './tests/utils';

const workspace = new TestWorkspace();
const path = await workspace.setup();
await workspace.createFile('test.txt', 'content');
await workspace.cleanup();
```

### Running Tests
```bash
# All tests
npm test

# Specific test file
npm test -- tests/planner.test.ts

# With coverage
npm run test:coverage
```

## Code Architecture Patterns

### Dependency Injection
Classes use constructor injection for dependencies:
```typescript
class Executor {
  constructor(safety: SafetyLayer = new SafetyLayer()) {
    this.safety = safety;
  }
}
```

### Async/Await Pattern
All I/O operations use async/await for consistency:
```typescript
async createPlan(goal: string, workspace: string): Promise<TaskPlan> {
  const steps = await this.generateSteps(goal, workspace);
  return { id, goal, workspace, steps };
}
```

### Error Handling
Consistent error handling with try-catch and proper logging:
```typescript
try {
  const result = await this.executeOperation(step);
  return { success: true, output: result, duration };
} catch (error) {
  return { success: false, error: error.message, duration };
}
```

## Performance Considerations

### Benchmarks
- File organization: < 30 seconds for typical workflows
- Report generation: < 20 seconds
- Data extraction: < 15 seconds
- Plan creation: < 50ms average
- Safety checks: < 1ms average

### Optimization Tips
1. Use file filtering to limit processing scope
2. Configure appropriate timeouts for complex operations
3. Monitor memory usage with large file sets
4. Use dry-run mode for validation before execution

## Extending the System

### Adding New Step Types
1. Update `TaskStep` type in `src/types/index.ts`
2. Implement step handler in `src/executor/index.ts`
3. Add safety rules in `src/safety/index.ts`
4. Add planning logic in `src/planner/index.ts`

### Adding New Task Patterns
1. Update `generateSteps()` method in `src/planner/index.ts`
2. Add corresponding tests in `tests/planner.test.ts`
3. Document the new pattern

### Configuration Extensions
1. Extend `PlannerConfig` interface
2. Update default configuration values
3. Add validation for new config options

## Security Considerations

### File System Access
- All operations are restricted to the specified workspace
- No access to files outside the workspace directory
- Path traversal protection

### Execution Safety
- Destructive operations require explicit confirmation
- Dry-run mode available for all operations
- Risk assessment for each operation type

### Error Handling
- Graceful degradation on errors
- No exposure of sensitive information in error messages
- Proper cleanup of temporary resources

## Contributing

### Development Workflow
1. Create feature branch from main
2. Implement changes with tests
3. Ensure all tests pass
4. Add or update documentation
5. Submit pull request

### Code Standards
- TypeScript strict mode enabled
- ESLint for code quality
- Jest for testing with minimum 80% coverage
- Comprehensive documentation for public APIs

### Testing Requirements
- Unit tests for all new functions
- Integration tests for workflow changes
- Performance tests for optimizations
- Error handling tests for edge cases

## Troubleshooting

### Common Issues

**Module Resolution Errors**
```bash
# Ensure TypeScript configuration is correct
npm run build
```

**Test Failures**
```bash
# Check test environment setup
NODE_ENV=test npm test
```

**Performance Issues**
```bash
# Run performance benchmarks
npm test -- tests/performance.test.ts
```

### Debug Mode
Enable detailed logging by setting environment variable:
```bash
DEBUG=cowork-lite npm run dev "task" ./workspace
```

## Future Enhancements

### Planned Features
- LLM integration for intelligent planning
- Plugin system for extensibility
- Browser automation capabilities
- Advanced configuration options
- Task templates and workflows

### Technical Debt
- Enhanced error types and handling
- Configuration file support
- Logging levels and structured output
- Memory usage optimization
- Async/await optimization

---

For more information, see the main README.md file or open an issue in the repository.