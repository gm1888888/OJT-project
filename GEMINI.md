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