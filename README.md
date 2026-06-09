# DMP41 Calibration System

A professional, web-based platform for ISO 376-compliant force calibrations using the HBM DMP41 precision amplifier. This system features a hybrid architecture combining a modern Node.js backend with a legacy-compatible Python Excel engine.

## Quick Start (Windows)

1.  **Run the Manager**: Double-click `Start_System.bat` to open the Management Console.
2.  **Start Services**: Select option **[1] Start System**. 
    - *Smart Startup:* The script automatically checks if a healthy localhost instance is already running. If found, it instantly opens a new tab and skips the boot process, preventing duplicate backend processes.
3.  **Automatic Install**: If run for the first time, missing dependencies (Node.js, Python, xlwings) will be installed automatically.
4.  **Access Dashboard**: The system will automatically open your default browser to `http://localhost:3000/auth`.

## Core Features

- **Real-Time Acquisition**: Stream mV/V data directly from DMP41 hardware via TCP/IP.
- **Hybrid Excel Engine**: Generate professional reports in `.xls` and `.pdf` formats while preserving legacy macros and formatting.
- **SQLite Persistence**: Robust local storage for calibration projects, test points, and load cell reference standards.

### Portable Saved Projects (Import & Export)
The system features a robust JSON-based export engine allowing users to transfer full calibration records across different installations or computers securely, without touching the raw database.

- **Single Project Export**: Click **Export Project** within any Historical or Archived record view to download a complete, self-contained JSON file containing all metadata, calculations, and environmental states.
- **Contextual Bulk Export**: Use the **Export All Projects** button. If clicked inside the Historical Records view, it packages all active history. If clicked inside the Archived Records view, it packages only archived data.
- **Intelligent Import Engine**: Click **Import Project** and select either a single or bulk export file. The system will present a summary modal showing the detected payload.
  - *Duplicate Handling Strategies:* Choose to **Import as Copy** (safely appends `(Imported X)` to duplicate names), **Skip Existing**, or destructively **Replace Existing**.

### Process Management
The `Start_System.bat` file acts as a targeted orchestration tool.
- **PID Tracking**: It uses a dedicated `logs/server.pid` tracker to isolate and manage only the processes spawned by the calibration system.
- **Safe Shutdown**: Selecting **Stop System** will gracefully terminate the specific Node.js server instance without globally killing other unrelated developer terminals or background Node tasks.

## Developer Documentation

### Architecture & Data Integrity
This system has been hardened for production environments. When developing or extending the system, strictly adhere to the following standards:
- **Zero-Bloat Ecosystem**: The project explicitly avoids bulky web-socket libraries or complex HTTP clients. Inter-service communication relies exclusively on native `fetch` and Server-Sent Events (SSE). 
- **Database Integrity**: The SQLite database engine enforces `PRAGMA foreign_keys = ON;`. Parent project destruction will cascade properly, but manual or bulk destructive actions (like "Replace Existing" imports) use `BEGIN TRANSACTION` blocks to ensure partial states are rolled back on failure.
- **Precision Policy**: All backend mathematics retain native floating-point depth. However, any DOM node rendering mV/V or kN data *must* be truncated to 6 decimal places (`.toFixed(6)`) to preserve visual alignment and match industrial standard readouts.
- **Structured Logging**: `console.log` spam is restricted during polling loops to preserve main-thread performance. Server logs must carry explicit `[INFO]`, `[WARN]`, or `[ERROR]` prefixes.

### Project Structure
- **Frontend (`public/`)**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Reactive UI without heavy frameworks.
- **Backend (`server.js`)**: Express.js server orchestrating hardware communication and database operations.
- **Services (`services/`)**:
  - `dmp41_interface.js`: TCP socket management for HBM hardware.
  - `calibration_engine.js`: ISO 376 mathematics and uncertainty quantification.
  - `excel_engine.js`: Bridge to Python for report generation.
- **Python Bridge (`excel_bridge.py`)**: Uses `xlwings` for high-fidelity Excel manipulation.

### Connection System
The system supports two modes toggled via the Hardware Settings:
- **Live Mode**: Direct connection to DMP41. Streams data via Server-Sent Events (SSE).
- **Demo Mode**: Simulated data for offline testing and software verification.

### Report Generation
All math is calculated by the `CalibrationEngine`, ensuring consistency across the dashboard and exported reports.
- **Excel Export / Print**: Populates `NewFormat.xlsx` using the Python bridge.
- **PDF Conversion**: Uses `excel_to_pdf.py` to convert populated Excel files into ISO-ready certificates.

### Load Cell Database
- **Unified Management**: All Reference Standards are managed via SQLite (`load_cells_reference` table) and fully editable via the UI.
- **Auto-Injection**: Selecting a standard automatically hydrates the calibration coefficients and metadata required for uncertainty equations.