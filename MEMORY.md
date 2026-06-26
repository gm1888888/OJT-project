# Project Memory & Successful Strategies

## Task: Implementing Import/Export for Reference Standards (2026-06-27)
- **Workflow:** Used subagents to decouple the investigation (research) from the implementation (full-stack engineering). The research agent correctly identified existing schema (`load_cells_reference`) and duplicate-handling patterns (`server.js` transaction block).
- **Execution Strategy:** Defined a strict prompt for the subagent limiting the UI elements to exactly two buttons (per user constraints) while hiding the file input. 
- **Learnings:** When expanding legacy API endpoints in this app, utilizing `BEGIN TRANSACTION` and handling primary key collisions iteratively inside the JS array processing block ensures robustness. Mirroring the exact structure of previous "Project" import logic saved significant time and ensured consistency.
- **Agent Workflow:** Always rely on subagents for codebase scanning and logic development, maintaining the default agent's role purely for planning and auditing.
