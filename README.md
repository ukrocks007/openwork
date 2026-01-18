# Cowork-Lite

A local, open-source AI coworker that runs on small hardware and does real work.

## Overview

Cowork-Lite is a **terminal-first AI coworker** built on the principle: **LLMs plan, code executes**. It uses bounded autonomy to help users execute tasks deterministically on their local machine.

### Key Features

- ✅ **Open Source**: Fully auditable and transparent
- ✅ **Local-First**: Runs entirely on your machine, no cloud required
- ✅ **Deterministic**: Predictable, inspectable task execution
- ✅ **Small Model**: Uses qwen2.5:0.5b for efficient planning
- ✅ **Bounded Autonomy**: LLM plans, code executes - never gives direct system access to AI
- ✅ **Terminal UI**: Optimized for SSH, TTYs, and headless systems
- ✅ **Comprehensive Testing**: 88 passing tests ensuring reliability

## Requirements

- **Node.js** ≥ 18
- **Ollama** (for running the local LLM)
- **Linux/macOS** (Windows support coming soon)
- **4GB RAM minimum** (designed to run on Raspberry Pi 4/5)

## Installation

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve
```

### 2. Pull the Model

```bash
ollama pull qwen2.5:0.5b
```

### 3. Install Cowork-Lite

```bash
# Clone the repository
git clone <repo-url>
cd cowork-lite

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Usage

### Running Cowork-Lite

```bash
# Run in development mode
npm run dev

# Or run the built version
npm start

# Specify a different working directory
npm start /path/to/workspace
```

### Example Session

```
█████  Cowork-Lite v0.1.0
Local AI coworker · deterministic · open-source
Model: qwen2.5:0.5b (Ollama)
──────────────────────────────────────────────────

▶ Describe what you want to get done:
> Read all markdown files in ./docs and create a summary

⏳ Planning...

📋 Generated Plan:
Task: Read all markdown files in ./docs and create a summary
Steps: 3
  1. readFiles (./docs)
  2. extractText
  3. createFile (./summary.md)

⚠ This plan contains destructive actions (create/write/move files)
Proceed? (y/n): y

▶ Executing plan...

✓ Execution completed successfully in 245ms
  3 steps executed
  Log file: /path/to/logs/cowork-2026-01-18T14-30-00-000Z.log
```

## Architecture

### Core Components

```
┌─────────────────────────────────────────┐
│          Terminal CLI                    │
│  (User Input / Output Display)           │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Planner Service                  │
│  (qwen2.5:0.5b via Ollama)               │
│  • Converts user tasks to JSON plans     │
│  • Validates plan structure              │
└────────────────┬────────────────────────┘
                 │
                 │ TaskPlan (validated JSON)
                 │
┌────────────────▼────────────────────────┐
│         Executor                         │
│  • Sandboxed file operations             │
│  • Deterministic execution               │
│  • Fail-fast error handling              │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Logger                           │
│  • Structured logging                    │
│  • Complete audit trail                  │
└─────────────────────────────────────────┘
```

### Task Plan DSL

Cowork-Lite uses a strict JSON DSL for task plans. The LLM generates plans, and the executor validates and runs them.

**Allowed Actions:**
- `readFiles` - Read files from disk
- `createFile` - Create a new file
- `writeFile` - Write/overwrite a file
- `moveFile` - Move/rename a file
- `extractText` - Process previously read content (placeholder for LLM in full implementation)
- `noop` - No operation (for planning/comments)

**Example Plan:**

```json
{
  "task": "Organize project files",
  "steps": [
    {
      "action": "readFiles",
      "path": "./src",
      "pattern": "*.ts"
    },
    {
      "action": "moveFile",
      "sourcePath": "./old-config.json",
      "destinationPath": "./archive/config.json"
    }
  ],
  "requiresConfirmation": true
}
```

## Safety Features

### Workspace Sandboxing
- All file operations are restricted to the configured workspace directory
- Path traversal attempts (e.g., `../../../etc/passwd`) are blocked
- Optional allowed paths for additional restrictions

### Confirmation for Destructive Actions
- Any plan that creates, writes, or moves files requires explicit user confirmation
- Plans are displayed before execution for review

### Execution Limits
- Maximum step count (default: 50)
- Per-step timeout (default: 30 seconds)
- Fail-fast behavior on first error

### Comprehensive Logging
- All plans are logged
- Every action and its result is recorded
- Complete audit trail for debugging and review

## Development

### Project Structure

```
cowork-lite/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── planner/        # LLM-based planning service
│   ├── executor/       # Deterministic execution engine
│   ├── logger/         # Structured logging
│   ├── utils/          # Utility functions
│   ├── __tests__/      # Test suites
│   └── index.ts        # Main CLI entry point
├── dist/               # Compiled JavaScript
├── logs/               # Execution logs
├── PRD.md              # Product Requirements Document
├── TASK.md             # Development task tracking
└── package.json
```

### Scripts

```bash
# Development
npm run dev            # Run with tsx (TypeScript execution)

# Building
npm run build          # Compile TypeScript to JavaScript

# Testing
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Generate coverage report

# Production
npm start              # Run compiled version
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- validator.test.ts

# Run with coverage
npm run test:coverage
```

**Current Test Status:** ✅ 88 tests passing

## Configuration

### Planner Configuration

The planner uses these settings by default:

```typescript
{
  model: 'qwen2.5:0.5b',
  temperature: 0.2,      // Low for deterministic output
  maxTokens: 1024,       // Sufficient for JSON plans
}
```

### Workspace Configuration

```typescript
{
  workingDirectory: process.cwd(),
  allowedPaths: [],      // Empty = all paths in workingDirectory
  maxSteps: 50,          // Maximum steps per plan
  stepTimeout: 30000,    // 30 seconds per step
  playwrightEnabled: false // Browser automation (v0.2)
}
```

## Roadmap

### v0.1 (Current) ✅
- [x] Core DSL and type system
- [x] Plan validation
- [x] File operation executor
- [x] Ollama integration
- [x] Structured logging
- [x] Simple CLI interface
- [x] Comprehensive test suite

### v0.2 (Planned)
- [ ] Playwright integration for browser tasks
- [ ] Resume interrupted tasks
- [ ] Context packs (Context7-style)
- [ ] Improved Ink-based TUI

### v0.3 (Future)
- [ ] Plugin system
- [ ] Optional secondary model for analysis
- [ ] Multi-workspace support

## Philosophy

Cowork-Lite is built on a simple belief:

> **Reliable systems come from discipline, not bigger models.**

We achieve this by:

1. **Separating Planning from Execution**: LLMs are great at planning but shouldn't execute directly
2. **Bounded Autonomy**: Every action must be explainable, inspectable, and limited
3. **Deterministic Execution**: Code, not AI, performs actual system operations
4. **Small Models, Strong Architecture**: Use the smallest model that works, with tight constraints

## Contributing

Contributions are welcome! Please ensure:

- All tests pass (`npm test`)
- Code follows existing patterns
- New features include tests
- TypeScript types are properly defined

## License

ISC

## Acknowledgments

Inspired by:
- Claude Code / OpenCode for the bounded autonomy concept
- Ollama for local LLM infrastructure
- The philosophy that smaller, disciplined systems beat larger, unreliable ones

---

**Built with discipline. Runs on a Raspberry Pi. Gets work done.**
