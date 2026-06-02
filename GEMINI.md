# GEMINI.md - DMP41 Calibration System (V2.1 - Hybrid Excel Engine)

## Project Overview
The **DMP41 Calibration System** is a professional, web-based platform designed to replace legacy Excel and LabWindows systems for high-precision force measurement calibrations. It interfaces with the **HBM DMP41 precision amplifier** via TCP/IP over LAN to perform ISO 376 and ISO 7500-1 compliant calibrations.

This system features a unique **Hybrid Excel Engine** that combines a modern, reactive web dashboard with the proven mathematical integrity and visual reporting format of the legacy Excel worksheet.

---

## Core Architecture
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Styled with a modern SaaS aesthetic (Inter font, soft shadows, rounded borders) while preserving the strict layout and monospace typography (`JetBrains Mono`) of legacy Excel tables for industrial readability.
- **Backend**: **Node.js** with **Express.js**. Features a centralized API for hardware communication, database management, and Excel integration.
- **Hardware Interface**: Native `net` module for ASCII protocol over TCP/IP (Port 1234). Features a command-queuing system to prevent socket race conditions.
- **Excel Bridge**: A **Python-based adapter** (`excel_bridge.py`) that uses `xlwings` to safely "hydrate" legacy binary `.xls` files without breaking original formulas or macros. Features dynamic cell targeting, text alignment formatting, and gridline enforcement.
- **Database**: **SQLite** (via `node:sqlite`) for robust, local storage of projects, measurement snapshots, and archival history.

---

## Key Features & Safety Workflows

### 1. Real-Time Data Acquisition
- **Precision Streaming**: Continuous mV/V readings with standard-deviation-based **stability detection**.
- **Hardware Terminal**: A built-in command-line interface for direct DMP41 interaction, featuring Regex-based command validation to ensure safe hardware operations.

### 2. Reactive Calculation Engine
- **Global Recalculations**: Every input (sensor coefficients, units, readings, temperature) triggers instant, global updates across all tables without page reloads.
- **Dynamic Table Expansion**: Support for custom calibration protocols via "+ Add Test Point" and "- Delete Test Point" buttons. Safety locks prevent the deletion of baseline or maximum capacity points to maintain mathematical stability.

### 3. Comprehensive Data Lifecycle
- **Historical Snapshots**: Saves a **complete physical and mathematical snapshot** (including transducer coefficients, environmental conditions, and raw readings) to ensure historical records are independent and audit-ready.
- **Load Demo Data**: Users can load historical calibration records directly into the live workspace as a starting template or for demonstration purposes.
- **Non-Destructive Archival**: A specialized "Archive" system replaces permanent deletion. Records can be moved to a minimalist Archive view to keep the workspace clean while remaining fully recoverable.
- **Safety Confirmation Layer**: Mandatory prompts for high-impact actions (Saving, Archiving, Exporting).

### 4. Advanced Reporting
- **Hybrid Export**: Populates data directly into the original legacy `.xls` template (`Testing Machine Software_revised (1).xls`), maintaining 100% visual parity with original reports.
- **Multi-Format Support**: One-click generation of ISO-compliant Certificates (HTML/PDF), CSV data exports, and formatted Print views.

### 5. Custom Load Cell Standards (New in V2.1)
- **Persistent CRUD**: Integrated `load_cells_reference` SQLite table with the frontend. Users can now Create, Read, Update, and Delete custom standards without touching source code.
- **Hybrid Source API**: Merges predefined standards from `config/load_cells.json` with user-defined standards from the database, distinguishing them via `is_system` flags.
- **Categorized UI**: Custom standards are grouped under "User Defined Standards" in the dropdown.
- **Auto-Injection**: Selecting a standard automatically hydrates the Live Sheet calculation engine and reporting metadata (Table 4).

---

## Setup & Deployment

### Automated Management Script
The project includes a robust `Start_System.bat` file designed for a "one-click" setup experience:
1. **Dependency Check**: Verifies Node.js and Python installations.
2. **Automated Install**: Uses the Windows Package Manager (`winget`) to download and install missing software directly in the terminal.
3. **Library Sync**: Automatically runs `npm install` and `pip install` for all required JS and Python components.
4. **Process Management**: Automatically cleans up hanging ports and starts the server in the current window with a persistent restart/exit menu.
5. **Portability**: Supports custom XAMPP installation paths via `.env` variable `XAMPP_ROOT`.

---

## Engineering Standards

### Mathematical Logic
- **Unified Engine**: The `calculateFullSuite()` method handles all logic for both live and historical views to guarantee mathematical parity.
- **Tare Logic**: The system uses the raw reading at the `0.0` test point in the Measured Data table as the absolute zero/tare reference.
- **Interpolation**: Linear interpolation is applied exactly as in the legacy system: `Interpolated Deflection = (Net Deflection / Indicated Force) * Target Force`.
- **Uncertainty Parity**: $w_{rep}$ is calculated from interpolated forces, and $w_{res}$ follows a rectangular distribution against the true reference force.

### Technical Integrity
- **Read-Only History**: Historical views utilize a `prefix` rendering mode that disables all inputs.
- **Database Migrations**: `server.js` contains automatic schema update logic for new feature deployments.

---

## Final Verification Status
- [x] **Export Metadata Mapping**: Cert No. and Calibration Date from custom standards are verified in `excel_bridge.py`.
- [x] **Duplicate Prevention**: Backend checks for unique serial numbers implemented in `server.js`.
- [x] **Portability Audit**: `Start_System.bat` updated to support dynamic XAMPP paths and resolved file locking conflicts during startup.
- [x] **Startup Diagnostics**: Added automatic surfacing of `node.log` on startup failure.
- [x] **Input Sanitization**: Enhanced validation for polynomial coefficients in the modal.
- [x] **CSS Refinement**: Polished grid layout for the "Manage Standard" modal.
