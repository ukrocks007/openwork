# Cowork Lite

An open-source AI-powered task automation platform inspired by Anthropic's Claude Cowork feature.

## Features

- **Task Planning**: Convert high-level goals into actionable step-by-step plans
- **Safe Execution**: Built-in safety checks with dry-run mode and confirmations
- **Workspace Management**: Sandboxed execution in designated folders
- **Extensible Architecture**: Modular design for plugins and connectors

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run a task (dry run to preview)
npm run dev "organize this folder of receipts into categories" ./my-folder --dry-run

# Execute the task
npm run dev "organize this folder of receipts into categories" ./my-folder
```

## Usage Examples

### File Organization
```bash
npm run dev "organize this folder of receipts into categories and output an expenses CSV" ./receipts
```

### Report Generation
```bash
npm run dev "generate first draft of a summary from these meeting notes" ./notes
```

### Data Extraction
```bash
npm run dev "extract data from CSV files and create summary report" ./data
```

## Architecture

- **Planner** (`src/planner/`): Creates execution plans from user goals
- **Executor** (`src/executor/`): Runs individual steps safely
- **Safety Layer** (`src/safety/`): Validates actions and manages confirmations
- **Types** (`src/types/`): TypeScript interfaces for the entire system

## Task Types

- `readFiles`: Scan directories and files
- `writeFile`: Create or overwrite files  
- `createFolder`: Create directory structures
- `extractData`: Parse and process data
- `generateReport`: Create documents and summaries

## Safety Features

- **Dry-run mode**: Preview actions before execution
- **Confirmation prompts**: Required for destructive operations
- **Risk assessment**: Each step evaluated for potential impact
- **Detailed logging**: Complete audit trail of all actions

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Project Status

✅ MVP Implementation Complete
- Core architecture
- Basic task planning
- Safe execution engine
- CLI interface
- Safety controls

🚧 Next Steps
- Browser automation (Playwright)
- Advanced LLM integration
- Plugin system
- UI/Progress dashboard

## License

MIT License - see LICENSE file for details.