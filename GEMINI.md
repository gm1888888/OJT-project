# GEMINI.md - DMP41 Calibration System (V2.0 - Hybrid Excel Engine)

## Project Overview
The **DMP41 Calibration System** is a professional, web-based platform designed to replace legacy Excel and LabWindows systems for high-precision force measurement calibrations. It interfaces with the **HBM DMP41 precision amplifier** via TCP/IP over LAN to perform ISO 376 and ISO 7500-1 compliant calibrations.

This system features a unique **Hybrid Excel Engine** that combines a modern, reactive web dashboard with the proven mathematical integrity and visual reporting format of the legacy Excel worksheet.

---

## Core Architecture
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Styled with a modern SaaS aesthetic (Inter font, soft shadows, rounded borders) while preserving the strict layout and monospace typography (`JetBrains Mono`) of legacy Excel tables for industrial readability.
- **Backend**: **Node.js** with **Express.js**. Features a centralized API for hardware communication, database management, and Excel integration.
- **Hardware Interface**: Native `net` module for ASCII protocol over TCP/IP (Port 1234). Features a command-queuing system to prevent socket race conditions.
- **Excel Bridge**: A **Python-based adapter** (`excel_bridge.py`) that uses `xlutils` to safely "hydrate" legacy binary `.xls` files without breaking original formulas or macros.
- **Database**: **SQLite** (via `node:sqlite`) for robust, local storage of projects, measurement snapshots, and archival history.

---

## Key Features & Safety Workflows

### 1. Real-Time Data Acquisition
- **Precision Streaming**: Continuous mV/V readings with standard-deviation-based **stability detection**.
- **Hardware Terminal**: A built-in command-line interface for direct DMP41 interaction, featuring Regex-based command validation to ensure safe hardware operations.

### 2. Reactive Calculation Engine
- **Global Recalculations**: Every input (sensor coefficients, units, readings, temperature) triggers instant, global updates across all 9 tables without page reloads.
- **Dynamic Table Expansion**: Support for custom calibration protocols via "+ Add Test Point" buttons for both Pre-Loading and Measured Data tables.

### 3. Comprehensive Data Lifecycle
- **Historical Snapshots**: Unlike simple logging, the system saves a **complete physical and mathematical snapshot** (including transducer coefficients, environmental conditions, and raw readings) to ensure historical records are independent and audit-ready.
- **Non-Destructive Archival**: A specialized "Archive" system replaces permanent deletion. Records can be moved to a minimalist Archive view to keep the workspace clean while remaining fully recoverable.
- **Safety Confirmation Layer**: Mandatory prompts for high-impact actions:
    - **Saving**: Confirms before overwriting or finalizing a record.
    - **Archiving**: Confirms before moving data out of active history.
    - **Exporting**: Confirms before generating Excel, CSV, or Certificates.

### 4. Advanced Reporting
- **Hybrid Export**: Populates data directly into the original legacy `.xls` template, maintaining 100% visual parity.
- **Multi-Format Support**: One-click generation of ISO-compliant Certificates (HTML/PDF), CSV data exports, and formatted Print views.

---

## UI/UX Workflow
1. **Project Description (Table 1)**: Metadata entry (Client, Instrument, Serial Number).
2. **Hardware & Transducer (Table 4)**: Configure connection parameters or select/edit load cell coefficients. Table 4 supports direct manual overrides for custom setups.
3. **Environmental Capture (Table 5)**: Track Temperature and Humidity before and after the session.
4. **Live Capturing (Tables 2-3)**: Monitor stability and capture readings directly to selected cells.
5. **Analysis & Classification (Tables 6-9)**: Real-time calculation of Net Values, Polynomial Estimation, and ISO 376 Uncertainty components.

---

## Setup & Deployment

### Automated Management Script
The project includes a robust `manage_server.bat` file designed for a "one-click" setup experience:
1. **Dependency Check**: Verifies Node.js and Python installations.
2. **Automated Install**: Uses the Windows Package Manager (`winget`) to download and install missing software directly in the terminal.
3. **Library Sync**: Automatically runs `npm install` and `pip install` for all required JS and Python components.
4. **Process Management**: Automatically cleans up hanging ports and starts the server in the current window with a persistent restart/exit menu.

---

## Engineering Standards

### Mathematical Logic
- **Unified Engine**: The `calculateFullSuite()` method handles all logic for both live and historical views to guarantee mathematical parity.
- **Uncertainty RSS**: Relative Standard Uncertainty components ($w_{rep}$, $w_{res}$, $w_{std}$) are calculated using the Root-Sum-Square approach as per ISO 376.
- **Classification**: ISO 376 Class (0, 1, 2, 3) is determined by the Expanded Uncertainty ($W_{exp}$) thresholds.

### Technical Integrity
- **Read-Only History**: Historical views utilize a `prefix` rendering mode that disables all inputs, preventing accidental modification of finalized records.
- **Database Migrations**: `server.js` contains automatic schema update logic to handle new feature deployments without manual DB intervention.
