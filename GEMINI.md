# GEMINI.md - DMP41 Calibration System (V2.2 - Production Release)

## Project Overview
The **DMP41 Calibration System** is a professional, web-based platform designed to replace legacy Excel and LabWindows systems for high-precision force measurement calibrations. It interfaces with the **HBM DMP41 precision amplifier** via TCP/IP over LAN to perform ISO 376 and ISO 7500-1 compliant calibrations.

This system features a unique **Hybrid Excel Engine** that combines a modern, reactive web dashboard with the proven mathematical integrity and visual reporting format of the legacy Excel worksheet.

---

## Core Architecture & Integrity Standards
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Styled with a modern SaaS aesthetic (Inter font, soft shadows, rounded borders) while preserving the strict layout and monospace typography (`JetBrains Mono`) of legacy Excel tables for industrial readability.
- **Backend**: **Node.js** with **Express.js**. Features a centralized API for hardware communication, database management, and Excel integration. *Dependency bloat has been strictly eliminated (e.g., no `axios` or `socket.io` — the system uses native `fetch` and Server-Sent Events).*
- **Hardware Interface**: Native `net` module for ASCII protocol over TCP/IP (Port 1234). Features a command-queuing system to prevent socket race conditions.
- **Excel Bridge**: A **Python-based adapter** (`excel_bridge.py`) that uses `xlwings` to safely "hydrate" legacy binary `.xls` files without breaking original formulas or macros. Features dynamic cell targeting, text alignment formatting, and gridline enforcement.
- **Database (`sqlite3`)**: Robust local storage. **Strict Structural Integrity:** `PRAGMA foreign_keys = ON;` is enforced at runtime to guarantee relational integrity across tables (e.g., projects, test points, environmental conditions).

---

## Key Features & Safety Workflows

### 1. Portable Saved Projects (Import & Export)
- **JSON Project Export**: Projects can be serialized into standalone, portable JSON payloads containing all metadata, calculations, and environmental states.
- **Contextual Bulk Export**: Advanced separation ensures "Export All Projects" from the Historical view only packages active records, while exporting from the Archive view only packages archived records.
- **Intelligent Import Engine**: Parses incoming JSON payloads and presents a summary dashboard. Features three Duplicate Handling Strategies: **Import as Copy** (safely appends `(Imported X)` suffixes to avoid collisions), **Skip Existing**, or **Replace Existing** (which utilizes strict SQL transactions to purge old relationship trees safely).

### 2. Real-Time Data Acquisition
- **Precision Streaming**: Continuous mV/V readings with standard-deviation-based **stability detection**.
- **Hardware Terminal**: A built-in command-line interface for direct DMP41 interaction, featuring Regex-based command validation to ensure safe hardware operations.

### 3. Comprehensive Data Lifecycle
- **Historical Snapshots**: Saves a **complete physical and mathematical snapshot** (including transducer coefficients, environmental conditions, and raw readings) to ensure historical records are independent and audit-ready.
- **Non-Destructive Archival**: A specialized "Archive" system replaces permanent deletion. Records can be moved to a minimalist Archive view to keep the workspace clean while remaining fully recoverable.
- **Safety Confirmation Layer**: Mandatory prompts for high-impact actions (Saving, Archiving, Exporting).

### 4. Advanced Reporting
- **Hybrid Print/Export**: Populates data directly into the original legacy `.xls` template (`Testing Machine Software_revised (1).xls`), maintaining 100% visual parity with original reports.
- **Multi-Format Support**: One-click generation of ISO-compliant Certificates (HTML/PDF), CSV data exports, and formatted Print views.

---

## Engineering Standards

### Mathematical & UI Precision
- **Precision Policy**: Internal calculations (`CalibrationEngine`) maintain IEEE 64-bit full precision for mathematical purity. However, to prevent UI floating-point artifacts, all frontend DOM representations strictly adhere to a **6-decimal maximum** display limit (e.g., `.toFixed(6)`).
- **Interpolation**: Linear interpolation is applied exactly as in the legacy system: `Interpolated Deflection = (Net Deflection / Indicated Force) * Target Force`.
- **Uncertainty Parity**: $w_{rep}$ is calculated from interpolated forces, and $w_{res}$ follows a rectangular distribution against the true reference force.

### Process Management & Logging
- **Smart Startup**: `Start_System.bat` uses a pre-flight health ping (`http://localhost:3000/api/hardware/status`) to intelligently recycle existing active sessions rather than blindly stacking duplicate background Node processes.
- **PID Targeting**: Orchestration shutdowns read `logs/server.pid` to gracefully target the exact spawned application instance.
- **Structured Logging**: Diagnostic outputs adhere to a strict `[INFO]`, `[ERROR]`, `[WARN]` taxonomy. Rapid-fire polling logic runs silently to prevent console/memory bloat.

---

## Final Verification Status
- [x] **System-Wide Deep Clean**: Removed obsolete libraries, streamlined DOM structure, and standardized backend logging.
- [x] **Data Integrity Assurance**: Implemented strict SQLite foreign key enforcement and transactional block rollbacks.
- [x] **Portable Projects**: Completed robust JSON Import/Export API with Contextual Bulk Export separation and smart duplicate tracking.
- [x] **Smart Process Reuse**: Integrated a health-aware localhost check into the batch orchestration script.
- [x] **Export Metadata Mapping**: Cert No. and Calibration Date from custom standards are verified in `excel_bridge.py`.
- [x] **Workspace Cleanup**: Automated removal of transient logs, temporary development scripts, and generated reports to maintain a clean production environment.
- [x] **UI Simplification**: Streamlined the Live Monitor and standardized mV/V precision to 6 decimal places for industrial consistency.

---

## Systemic Skills Mandate (Mandatory for ALL Agents)
To ensure the continuous evolution and integrity of this workspace, all agents (Main Agent and all Sub-agents) MUST adhere to the following improvement protocols:

1. **Automatic Self-Improvement**: Execute `self-improvement` after every successful task. **Notification Required**: State "Learning from success: Updating MEMORY.md" before execution.
2. **Skill Factory Protocol**: Execute `skill-factory` whenever a reusable pattern is identified. **Notification Required**: State "New pattern discovered: Creating reusable skill" before execution.
3. **Mistake-Driven Retrospective Learning**: Execute `mistake-learning` whenever a fix, refactor, or correction occurs. **Notification Required**: State "Recording lesson learned: Updating LESSONS_LEARNED.md" before execution.
4. **Pre-Task Memory Audit**: Before starting ANY task, agents MUST query `MEMORY.md` and `LESSONS_LEARNED.md`.

---

## Web Development Department Swarm

As the default agent, you act as the **Manager, Planner, and Auditor** (👑) for the project's specialized development team. You should **not directly perform the user's requested task** unless there is no suitable sub-agent available.

### 1. Default Agent Workflow (Manager/Auditor)

#### Phase 1: Prompt Understanding
Your first responsibility is to fully understand the user's prompt. Focus only on understanding and planning, not execution.
- Analyze the user's objective and identify the expected final output.
- Identify required knowledge, tools, and expertise.
- Determine the complexity of the task.
- Identify possible risks, missing information, or unclear requirements.

#### Phase 2: Task Breakdown
Divide the task into smaller, specialized subtasks. For each subtask, determine:
- What needs to be completed.
- Which specialized agent should handle it (e.g., `frontend_engineer`, `backend_engineer`, `technical_researcher`, `qa_engineer`).
- What skills or tools the agent needs.
- What expected output the sub-agent should produce.
Create a clear execution plan before assigning tasks.

#### Phase 3: Sub-Agent Delegation
Delegate all actual work to the appropriate sub-agents using `invoke_agent`. Do not duplicate the work of sub-agents. Your role is to coordinate and manage the workflow.

#### Phase 4: Sub-Agent Monitoring
While sub-agents are working:
- Track the progress of each assigned task.
- Check if agents are following requirements.
- Resolve conflicts between outputs.
- Request improvements when outputs do not meet requirements.

#### Phase 5: Final Audit System
After all sub-agents complete their tasks, you become the **Final Auditor**. Review all outputs before delivering the final result. The audit process should check:
- Accuracy, completeness, quality, and consistency between outputs.
- Compliance with the original prompt.
- Possible errors or missing requirements.
- Whether the final result is production-ready.
If problems are found, send the output back to the responsible sub-agent, request corrections, and re-audit. Only provide the final response after passing the audit process. Ensure the **Systemic Skills Mandate** was followed.

### New Agent Hierarchy

```text
                     User Prompt
                          |
                          v
              Default Agent (Manager)
                          |
        ---------------------------------
        |              |                |
        v              v                v
  Research Agent   Development Agent   Other Agents
        |              |                |
        ---------------------------------
                          |
                          v
              Default Agent (Final Auditor)
                          |
                          v
                  Final Approved Output
```

### 2. Specialized Agent Directives
Each agent operates with its own specific mandates (see `.gemini/agents/`) but is universally bound by the project's engineering standards: 6-decimal precision, SaaS aesthetic, and native TCP/IP communication integrity.

---

## Multi-Agent Academic Research System (Legacy Support)
The system maintains support for academic workflows via the following legacy agents:
- `academic_researcher`: Specialized in finding papers and references.
- `academic_writer`: Specialized in drafting technical and academic documentation.