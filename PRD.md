# Product Requirements Document (PRD)

## Project: **Cowork-Lite**

**Subtitle:** A local, open-source AI coworker that runs on small hardware and does real work.

---

## 1. Purpose

Cowork-Lite is a **terminal-first AI coworker** that helps a single user execute real tasks on their local machine using **bounded autonomy**.

It is inspired by Claude Cowork, but intentionally designed to be:

* open-source
* local-first
* auditable
* deterministic
* runnable on low-resource hardware (e.g. Raspberry Pi 4/5 with 4GB RAM)

Cowork-Lite is **not** a chat app and **not** a web application.

---

## 2. Explicit Non-Goals (Hard Constraints)

Cowork-Lite will **not**:

* implement a web UI
* expose an HTTP server or APIs
* support multi-user workflows
* run in the browser
* allow free-form autonomous exploration
* allow the model to directly execute commands
* rely on cloud LLMs by default

These exclusions are **intentional** and **non-negotiable** for v1.

---

## 3. Target Environment

### Hardware

* Raspberry Pi 4 / 5 (4GB RAM minimum)
* Also runnable on laptops / desktops

### OS

* Linux (Debian / Ubuntu family)

### Runtime Dependencies

* Node.js ≥ 18
* Ollama (local model server)
* OpenCode CLI
* Optional: Playwright (feature-gated)

---

## 4. Core Design Philosophy

1. **Plan ≠ Execute**

   * LLMs plan.
   * Code executes.

2. **Bounded Autonomy**

   * Every action must be explainable, inspectable, and limited.

3. **Small Models, Strong Architecture**

   * Use disciplined models with tight prompts.
   * Prefer reliability over “intelligence”.

4. **Terminal-First UX**

   * Optimized for SSH, TTYs, and headless systems.

5. **Auditability Over Convenience**

   * Every decision and action is logged.

---

## 5. Model & Agent Stack (Fixed)

### Planner Model

* **Model:** `qwen2.5:0.5b`
* **Runtime:** Ollama
* **Temperature:** ≤ 0.2
* **Max tokens:** ≤ 1024

**Rationale**

* Excellent instruction obedience
* Fast on ARM
* Stable structured output
* Low hallucination rate

### Agent Runtime

* **OpenCode**
* Responsibilities:

  * repository and workspace awareness
  * context injection
  * tool/MCP orchestration
  * safe interaction with filesystem and Playwright

---

## 6. High-Level Architecture

```
Terminal UI (Ink)
      ↓
Cowork-Lite Core
      ↓
Planner (qwen2.5:0.5b via Ollama)
      ↓
Validated Task Plan (JSON DSL)
      ↓
Executor (deterministic code)
      ↓
Logs + Results
```

The LLM **never**:

* executes shell commands
* touches the filesystem directly
* controls the browser directly

---

## 7. User Interface (Terminal UX Only)

### UX Characteristics

* ASCII header / branding on startup
* Persistent input box (Claude Code / OpenCode style)
* Clear state transitions:

  * idle
  * planning
  * confirmation
  * executing
  * done / error
* Progress indicators and step-by-step status
* Keyboard-first interaction

### Example Startup Screen

```
█████  Cowork-Lite
Local AI coworker · deterministic · open-source
Model: qwen2.5:0.5b (Ollama)

▶ Describe what you want to get done.

> _
```

No readline. No raw stdin.
A proper TUI implemented using **Ink**.

---

## 8. Core Workflow

1. User enters a task outcome in the terminal
2. Planner generates a **task plan** (JSON DSL)
3. Plan is displayed to the user
4. If destructive actions exist → user confirmation required
5. Executor runs steps sequentially
6. Results and logs are displayed
7. Task ends deterministically

---

## 9. Task Planning DSL (Core Contract)

Planner output must conform to a strict JSON schema.

### Example

```json
{
  "task": "Summarize meeting notes",
  "steps": [
    { "action": "readFiles", "path": "./notes" },
    { "action": "extractText" },
    { "action": "writeFile", "path": "./summary.md" }
  ],
  "requiresConfirmation": false
}
```

### Allowed Actions (v1)

* `readFiles`
* `createFile`
* `writeFile`
* `moveFile`
* `extractText`
* `runPlaywrightTask` (feature-gated)
* `noop`

Any unknown or malformed action → plan rejected.

---

## 10. Executor Requirements

* Executes steps strictly in order
* No retries unless explicitly defined
* Hard timeouts per step
* Workspace sandboxing (no access outside allowed directory)
* Detailed logging per step
* Fail-fast on errors

---

## 11. Playwright Integration (Optional)

Playwright is:

* disabled by default
* enabled explicitly by the user
* accessed only through predefined tasks

The planner:

* cannot invent selectors
* cannot browse freely
* cannot loop or explore

Use cases:

* fetch page content
* extract structured data
* fill known forms

---

## 12. Safety Mechanisms

* Plan preview before execution
* Explicit confirmation for:

  * deletes
  * overwrites
  * bulk operations
* Dry-run mode
* Step count limits
* Execution time limits
* Clear cancellation via Ctrl-C

---

## 13. Functional Requirements

| ID   | Requirement                       |
| ---- | --------------------------------- |
| FR-1 | Accept outcome-based user tasks   |
| FR-2 | Generate inspectable task plans   |
| FR-3 | Execute plans deterministically   |
| FR-4 | Enforce workspace sandboxing      |
| FR-5 | Provide real-time progress output |
| FR-6 | Log all actions and results       |

---

## 14. Non-Functional Requirements

* Must run within 4GB RAM
* Must be usable over SSH
* Must not require GPU
* Must not expose network services
* Must be resilient to partial failures

---

## 15. CLI Interface (v1)

Example:

```bash
cowork-lite
```

Interaction is **interactive TUI**, not command flags.

---

## 16. What Cowork-Lite Is NOT

* Not a chatbot
* Not a web service
* Not an agent swarm
* Not a background daemon
* Not a cloud product
* Not an autonomous explorer

This clarity is a feature.

---

## 17. Roadmap

### v0.1

* Terminal UI
* Filesystem tasks
* Planner + executor
* Logging

### v0.2

* Playwright tasks
* Resume interrupted tasks
* Context packs (Context7-style)

### v0.3

* Plugin system
* Optional secondary model for analysis (non-planning)

---

## 18. Success Criteria

* Tasks complete without surprises
* Users trust the plan preview
* System remains stable under load
* Clear understanding of what happened and why

---

## 19. Final Statement

Cowork-Lite is built on a simple belief:

> **Reliable systems come from discipline, not bigger models.**

By combining **qwen2.5:0.5b**, **Ollama**, **OpenCode**, and a terminal-first UX, Cowork-Lite delivers a practical, inspectable AI coworker that people can actually run and trust.
