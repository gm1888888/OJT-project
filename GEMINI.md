# GEMINI.md - DMP41 Calibration System (V2.0 - Hybrid Excel Engine)

## Project Overview
The **DMP41 Calibration System** is a standalone, web-based platform designed to replace legacy Excel and LabWindows systems for force measurement calibrations. It interfaces with the **HBM DMP41 precision amplifier** via TCP/IP over LAN to perform ISO 376-compliant calibrations.

This system features a unique **Hybrid Excel Engine** that combines a modern, real-time web dashboard with the proven mathematical integrity and visual reporting format of the legacy Excel worksheet.

### Key Features
- **Real-Time Data Acquisition**: Streams high-precision mV/V readings from HBM DMP41 via TCP sockets with standard-deviation-based stability detection.
- **Native Data Logger Suite**: A full-fidelity recreation of the legacy Excel "Data Logger" sheet (Tables 1-9) as an interactive web component.
- **ISO 376 Uncertainty Engine**: Deterministic calculation of $w_{rep}$, $w_{res}$, $w_{std}$, and $W_{exp}$ based on real measurement fluctuations and zero-referenced net values.
- **Hybrid Reporting**: Populates and exports data directly into the original legacy `.xls` template, maintaining 100% visual and logical parity for formal certificates.
- **Reactive Workflow**: Every input (sensor coefficients, units, readings, temperature) triggers instant, global recalculations across all 8 tables.
- **Reference Standard Database**: Built-in selector for load cells that automatically hydrates polynomial coefficients ($F = ad + bd^2 + cd^3$) and uncertainty parameters.
- **Global Unit Converter**: High-precision, real-time conversion between **kgf, kN, lbf, and N**.
- **Persistence**: Local data storage using SQLite for projects, measurements, and calibration history.
- **Enhanced Demo Mode**: One-click "Load Excel Demo Data" to verify system accuracy against legacy records using simulated ±0.000005 mV/V noise.

## Architecture
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6+). Styled with a modern SaaS aesthetic (Inter font, soft shadows, rounded borders) while preserving the strict layout and monospace typography (`JetBrains Mono`) of the legacy Excel tables for industrial readability.
- **Backend**: **Node.js** with **Express.js**. Features a centralized API for hardware, database, and Excel integration.
- **Excel Bridge**: A **Python-based adapter** (`excel_bridge.py`) that uses `xlutils` to safely "hydrate" legacy binary `.xls` files without breaking formulas or macros.
- **Database**: **SQLite** (via `node:sqlite` built-in module) with batch processing support for manual data entry.
- **Hardware Interface**: Native `net` module for ASCII protocol over TCP/IP (Port 1234).

## UI/UX Workflow
The application is structured into a strict 4-step workflow to maximize operator efficiency during live calibrations:
1. **Project Descriptions (Table 1)**: Top-level metadata entry (Client, Instrument, Serial Number).
2. **Settings (Hardware & Setup)**: Left-panel controls for Reference Standard selection, Unit selection, and DMP41 connection parameters.
3. **Capturing (Live Force Reading)**: Right-panel monitor featuring the giant LED-style readout, stability chart, and the primary "Capture to Selected Cell" action button.
4. **Calibration Data & Analysis Tables (Tables 2-9)**: Bottom-spanning panels separating raw input grids (Tables 2-5) from dynamically adapting, calculated analysis tables (Tables 6-9).

## Tech Stack & Dependencies
- **Node.js Ecosystem**: Express, Socket.io, `node:sqlite`
- **Python Ecosystem**: `xlrd`, `xlwt`, `xlutils` (required for Excel Bridge)
- **Reporting**: Python Excel Bridge, jsPDF, html2canvas

## Directory Structure
- `/public`: Frontend assets. `main.js` contains the reactive core logic. `style.css` contains the modern SaaS styling mixed with legacy table constraints.
- `/services`: Core logic (Hardware interface, math engine, `excel_engine.js`).
- `/config`: JSON databases for Load Cells and Excel Field Mappings.
- `/reports`: Temporary storage for generated legacy Excel reports.
- `/dmp41 documentation`: Technical manuals for the HBM DMP41.

## Building and Running

### Prerequisites
- Node.js (v22.5.0+)
- Python 3.x (with `xlrd==1.2.0`, `xlwt`, `xlutils` installed)

### Installation
```bash
npm install
pip install xlutils xlrd==1.2.0 xlwt
```

### Running the Application
```bash
# Start the Node.js server
node server.js
```
The application will be available at `http://localhost:3000`.

## Development Conventions
- **Hardware Communication**: Always use the `DMP41Interface` service. It handles command queuing and buffer management.
- **Mathematical Logic**: All uncertainty and polynomial calculations must be kept in the frontend's `calculateFullSuite()` to ensure real-time UI updates, with mirrors in the Node.js `CalibrationEngine`.
- **Database Operations**: Use the `batch` endpoint for saving measurement series. Ensure all parameter bindings use nullish coalescing (`?? null`) to satisfy `node:sqlite` strictness.
- **Visual Fidelity**: Empty or null values in input/calculated grids MUST render as `- -` (not 0 or blank) to match the legacy Excel format. Tables 6-9 MUST dynamically adapt to the exact number of active test points.
- **Zero Referencing**: All uncertainty calculations ($w_{rep}$) and net values MUST be derived from subtracting the Point 0.0 baseline from Table 2.
- **Error Formulas**: Relative Accuracy Error ($q$) must be calculated as `(Indicated - True) / True`.
- **Classification**: ISO 7500-1 Classification is strictly determined by the *Maximum* of the absolute Relative Accuracy Error ($q$), Relative Repeatability Error ($b$), and Zero Error ($f_0$).

## Table Mapping (Excel Suite)
- **Table 1**: Description & Ref No.
- **Table 2**: Pre-Loading (Baseline 0 and Max Cap).
- **Table 3**: Measured Data (Primary point-capture grid). Displays raw averages of indicated force and uncorrected mV/V deflection.
- **Table 4**: Transducer Information (Coefficient DB).
- **Table 5**: Environmental Conditions (T/H tracking).
- **Table 6**: Net Value & Mean deflection (Zero-corrected).
- **Table 7-8**: Linear Interpolation & Reference Force Estimation (Polynomial calculated forces).
- **Table 9**: ISO 7500-1 Classification & Uncertainty Calculations.
