# DMP41 Calibration System

A standalone, web-based platform for ISO 376-compliant force calibrations using the HBM DMP41 precision amplifier.

## Quick Start (Windows)

1.  **Run the Manager**: Double-click `manage_server.bat` in the project root.
2.  **Follow Setup**: The script will automatically check for Node.js and Python.
3.  **Automatic Install**: Once software is detected, it will automatically install all necessary dependencies (`npm install` and `pip install xlwings`).
4.  **Start Server**: The script will start the server in the terminal.
5.  **Open Dashboard**: Navigate to `http://localhost:3000` in your web browser.

## Developer Documentation

### Project Structure
- **Frontend (`public/`)**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Reactive UI without modern frameworks. Handles local state and data visualization.
- **Backend (`server.js`)**: Express.js server acting as the central orchestrator. Uses `node:sqlite` for synchronous local database management.
- **Services (`services/`)**:
  - `dmp41_interface.js`: Manages TCP connections and serial commands to the DMP41 hardware.
  - `calibration_engine.js`: Performs ISO 376 math, 3-run averages, polynomials, and uncertainty budgets.
  - `excel_engine.js`: Interfaces with Python to generate Excel/PDF outputs.
- **Python Bridge (`excel_bridge.py`)**: Uses `xlwings` to safely hydrate legacy `.xls` files without destroying visual parity or macros.

### Connection System
The system supports two modes toggled via `/api/hardware/mode`:
- **Live Mode**: Opens a TCP socket to the DMP41. Streams `mV/V` readings via Server-Sent Events (SSE). Tracks connection state (`Connected`, `Standby`, `Disconnected`).
- **Demo Mode**: Synthesizes stable measurements internally without requiring physical hardware, suitable for offline demonstration and testing.

### Report & Export System
All math is calculated locally by the `CalibrationEngine`, but during export, `server.js` consolidates data via `buildExportData()`.
- **Excel Export**: Injects the consolidated JSON payload directly into `NewFormat.xlsx` via `excel_bridge.py`. It explicitly avoids modifying structural template features (like merged cells) to preserve legacy borders.
- **PDF Export**: Generates the Excel file, then uses `excel_to_pdf.py` (via `xlwings`) to export the resulting layout directly to a native PDF.

### Archive and History Workflow
- **History (Saved)**: Records saved from the Live Monitor move to History. They remain active and can be Exported (Excel/PDF) or Printed.
- **Archive**: Records marked `is_archived = 1` enter a strict read-only state. Frontend buttons for export/print are hidden, and Backend APIs (`/api/export/*`) intercept and reject (`403 Forbidden`) any programmatic requests. A record must be moved back to History to be exported.

### Load Cell Database Workflow
- **Hybrid Data Source**: Combines static System standards (`config/load_cells.json`) with dynamic Custom standards stored in SQLite (`load_cells_reference`).
- **Data Validation**: Custom standards are verified for duplicate Serial Numbers before insertion.
- **Utilization**: Selecting a standard automatically loads its capacity, serial number, calibration date, and strict polynomial coefficients (Compression and Tension) into the active workspace.