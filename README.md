# DMP41 Calibration System

A professional, web-based platform for ISO 376-compliant force calibrations using the HBM DMP41 precision amplifier. This system features a hybrid architecture combining a modern Node.js backend with a legacy-compatible Python Excel engine.

## Quick Start (Windows)

1.  **Run the Manager**: Right-click `Start_System.bat` and select **"Run as Administrator"**.
2.  **Follow Setup**: The script will automatically check for Node.js, Python, and XAMPP.
3.  **Automatic Install**: Missing dependencies (Node.js, Python, xlwings) will be installed automatically via `winget` and `pip`.
4.  **Start Services**: Select option **[1] Start System** to launch the Node.js engine and XAMPP services.
5.  **Access Dashboard**: The system will automatically open your default browser to `http://localhost/php-auth-system/`.

## Core Features

- **Real-Time Acquisition**: Stream mV/V data directly from DMP41 hardware via TCP/IP.
- **Hybrid Excel Engine**: Generate professional reports in `.xls` and `.pdf` formats while preserving legacy macros and formatting.
- **SQLite Persistence**: Robust local storage for calibration projects and load cell standards.
- **PHP Auth Bridge**: Secure gatekeeper for the calibration dashboard.

## Developer Documentation

### Project Structure
- **Frontend (`public/`)**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Reactive UI without heavy frameworks.
- **Backend (`server.js`)**: Express.js server orchestrating hardware communication and database operations.
- **Services (`services/`)**:
  - `dmp41_interface.js`: TCP socket management for HBM hardware.
  - `calibration_engine.js`: ISO 376 mathematics and uncertainty quantification.
  - `excel_engine.js`: Bridge to Python for report generation.
- **Python Bridge (`excel_bridge.py`)**: Uses `xlwings` for high-fidelity Excel manipulation.
- **Authentication (`php-auth-system/`)**: PHP-based user management and session gatekeeper.

### Connection System
The system supports two modes toggled via the Hardware Settings:
- **Live Mode**: Direct connection to DMP41. Streams data via Server-Sent Events (SSE).
- **Demo Mode**: Simulated data for offline testing and software verification.

### Report & Export System
All math is calculated by the `CalibrationEngine`, ensuring consistency across the dashboard and exported reports.
- **Excel Export**: Populates `NewFormat.xlsx` using the Python bridge.
- **PDF Export**: Uses `excel_to_pdf.py` to convert populated Excel files into ISO-ready certificates.

### Load Cell Database
- **Hybrid Source**: Merges system-defined standards (`config/load_cells.json`) with user-defined standards (SQLite).
- **Auto-Injection**: Selecting a standard automatically hydrates the calibration coefficients and metadata.
