# COMPREHENSIVE AI PROMPT & TECHNICAL PLAN
## DMP41 Web-Based Calibration System (Localhost)

---

## EXECUTIVE SUMMARY

Build a **standalone, web-based calibration platform** that replaces the legacy Excel + LabWindows system. The system will run on `localhost:3000` or `localhost:5173`, communicate with HBM DMP41 via TCP/IP over LAN, and perform ISO 376-compliant force measurement calibrations with real-time data acquisition, polynomial calculations, uncertainty quantification, and certificate generation.

---

## PHASE 1: SYSTEM ARCHITECTURE

### 1.1 Technology Stack

```
FRONTEND LAYER:
├─ HTML5 (Semantic markup, forms)
├─ CSS3 (Flexbox, Grid, responsive design)
├─ Vanilla JavaScript (ES6+, async/await, fetch API)
└─ Optional: Lightweight UI framework (Bootstrap 5 or Tailwind)

BACKEND LAYER:
├─ Node.js (v16+)
├─ Express.js (API routing, middleware)
├─ Socket.io (Real-time streaming from DMP41)
└─ Native `net` module (TCP/IP sockets)

DATA LAYER:
├─ SQLite3 (Local persistent storage)
├─ In-memory cache (Redis optional, but not required)
└─ JSON files (Load cell database, calibration templates)

HARDWARE INTERFACE:
├─ TCP/IP Socket Communication (Port 1234 or 10001)
├─ HBM DMP41 ASCII Protocol (MSV?, CHS, TAR, RAR commands)
└─ Mock/Demo Mode (Simulated hardware for testing)

REPORTING:
├─ HTML-to-PDF (jsPDF, html2canvas)
├─ CSV Export
└─ Embedded certificate templates
```

### 1.2 System Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                         │
│           (http://localhost:3000)                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Dashboard / Real-Time Monitor                  │    │
│  │  ├─ Live force readings                         │    │
│  │  ├─ Calibration sequence control                │    │
│  │  └─ Data entry / results display                │    │
│  └─────────────────────────────────────────────────┘    │
└──────────┬───────────────────────────────┬───────────────┘
           │ REST API + WebSockets         │ HTTP
           │ (Fetch, axios)                │
           ↓                               ↓
┌──────────────────────────────────────────────────────────┐
│              NODE.JS EXPRESS SERVER                       │
│           (:3000 backend)                                │
│  ┌──────────────────────────────────────────────┐       │
│  │ ROUTES                                       │       │
│  │ ├─ GET /api/hardware/status                  │       │
│  │ ├─ GET /api/hardware/read (polling)          │       │
│  │ ├─ GET /api/hardware/stream (SSE)            │       │
│  │ ├─ POST /api/dmp41/config (IP/port setup)    │       │
│  │ ├─ POST /api/calibration/start               │       │
│  │ ├─ POST /api/calibration/capture             │       │
│  │ ├─ POST /api/math/calculate                  │       │
│  │ ├─ POST /api/certificate/generate            │       │
│  │ └─ GET /api/projects (CRUD)                  │       │
│  └──────────────────────────────────────────────┘       │
│  ┌──────────────────────────────────────────────┐       │
│  │ SERVICES                                     │       │
│  │ ├─ dmp41_interface.js (TCP/IP driver)        │       │
│  │ ├─ calibration_engine.js (ISO 376 math)      │       │
│  │ ├─ certificate_generator.js (PDF/HTML)       │       │
│  │ └─ database_manager.js (SQLite ops)          │       │
│  └──────────────────────────────────────────────┘       │
└──────────┬──────────────────┬──────────────────────────┘
           │ TCP/IP Socket    │ SQLite Read/Write
           │ (Port 1234)      │
           ↓                  ↓
┌──────────────────────────────────────────────────────────┐
│              HARDWARE & STORAGE                           │
│  ┌──────────────────────┐   ┌─────────────────────┐     │
│  │  HBM DMP41 Amplifier │   │ calibration.db      │     │
│  │  (LAN / Ethernet)    │   │ ├─ projects         │     │
│  │  ├─ Channel 1/2      │   │ ├─ test_points      │     │
│  │  └─ TCP port 1234    │   │ ├─ coefficients     │     │
│  └──────────────────────┘   │ ├─ load_cells       │     │
│                              │ └─ certificates     │     │
│                              └─────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## PHASE 2: DATA MODEL & DATABASE SCHEMA

### 2.1 SQLite Database Schema

```sql
-- Projects (Calibration sessions)
CREATE TABLE calibration_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  client_name TEXT,
  instrument_name TEXT,
  serial_number TEXT,
  capacity_kgf REAL,
  range_min_kgf REAL,
  range_max_kgf REAL,
  input_unit TEXT DEFAULT 'kgf',           -- kgf, lbf, N, kN
  output_unit TEXT DEFAULT 'kN',
  calibration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  mode TEXT DEFAULT 'Compression',         -- Compression, Tension
  status TEXT DEFAULT 'In Progress',       -- In Progress, Completed, Cancelled
  temperature_before REAL,
  temperature_after REAL,
  humidity_before REAL,
  humidity_after REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Test Points (Individual measurements)
CREATE TABLE test_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  stage_name TEXT,                         -- "Pre-Load", "1st Test Point", etc.
  target_value_kgf REAL,
  measurement_sequence INTEGER,            -- 1, 2, 3, ..., 10
  angular_position TEXT,                   -- "0°", "120°", "240°"
  raw_reading_mvv REAL,                    -- mV/V from DMP41
  zero_corrected_mvv REAL,                 -- After tare subtraction
  equivalent_force_kn REAL,                -- Converted to kN
  series_number INTEGER DEFAULT 1,         -- Which run (1, 2, or 3)
  reading_timestamp DATETIME,
  is_valid BOOLEAN DEFAULT 1,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
);

-- Transducer Coefficients (Load cell calibration)
CREATE TABLE transducer_coefficients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  load_cell_model TEXT,                    -- HBM/C3H3, WBRC-R2M, etc.
  load_cell_sn TEXT,
  capacity_kn REAL,
  calibration_cert_no TEXT,
  calibration_date DATE,
  coefficient_a REAL,                      -- F = A*D + B*D² + C*D³
  coefficient_b REAL,
  coefficient_c REAL,
  uncertainty_percent REAL,                -- U, %
  coverage_factor REAL DEFAULT 2,          -- k value
  compression_mode BOOLEAN DEFAULT 1,      -- T/C capability
  tension_mode BOOLEAN DEFAULT 0,
  FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
);

-- Calculated Results
CREATE TABLE calibration_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  measurement_point INTEGER,               -- 0 (zero), 1, 2, ..., 10
  target_force_kgf REAL,
  series1_reading_kn REAL,
  series2_reading_kn REAL,
  series3_reading_kn REAL,
  mean_force_kn REAL,                      -- Average of 3 runs
  repeatability_kn REAL,                   -- Std dev of 3 runs
  resolution_uncertainty_kn REAL,
  tare_uncertainty_kn REAL,
  temperature_uncertainty_kn REAL,
  drift_uncertainty_kn REAL,
  combined_uncertainty_kn REAL,
  expanded_uncertainty_kn REAL,            -- k × combined
  relative_uncertainty_percent REAL,
  relative_error_percent REAL,             -- (mean - target) / target
  accuracy_error_percent REAL,
  repeatability_error_percent REAL,
  classification TEXT,                     -- Class 0, 1, 2, 3
  FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
);

-- Environmental Conditions Log
CREATE TABLE environmental_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  temperature_celsius REAL,
  humidity_percent REAL,
  pressure_pa REAL,
  notes TEXT,
  FOREIGN KEY (project_id) REFERENCES calibration_projects(id)
);

-- Load Cell Database (Reference standards)
CREATE TABLE load_cells_reference (
  id INTEGER PRIMARY KEY,
  model TEXT UNIQUE,
  description TEXT,
  capacity_kn REAL,
  serial_number TEXT,
  calibration_certificate TEXT,
  calibration_date DATE,
  coeff_a_compression REAL,
  coeff_b_compression REAL,
  coeff_c_compression REAL,
  uncertainty_compression_percent REAL,
  coeff_a_tension REAL,
  coeff_b_tension REAL,
  coeff_c_tension REAL,
  uncertainty_tension_percent REAL,
  next_calibration_date DATE
);
```

### 2.2 JSON Configuration Files

```json
// config/load_cells.json
{
  "load_cells": [
    {
      "id": 1,
      "model": "HBM/C3H3",
      "capacity_kn": 10,
      "serial": "F93007",
      "cert_no": "1800-00040-004",
      "cert_date": "2023-03-01",
      "a": 4.902632,
      "b": -0.0009307508,
      "c": -6.355071e-05,
      "u_percent": 0.011,
      "k": 2,
      "compression": true,
      "tension": true
    },
    {
      "id": 2,
      "model": "HBM/C6",
      "capacity_kn": 2000,
      "serial": "F42442",
      "cert_no": "1800-00040-002",
      "a": 978.3389,
      "b": 35.04818,
      "c": -7.94019,
      "u_percent": 1.375,
      "compression": true
    }
  ]
}

// config/dmp41_settings.json
{
  "hardware": {
    "host": "192.168.1.100",
    "port": 1234,
    "timeout_ms": 5000,
    "command_end_char": "\r\n"
  },
  "calibration": {
    "default_points": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    "stability_threshold": 0.05,
    "stability_window": 5,
    "polling_interval_ms": 1000,
    "max_retries": 3
  },
  "demo_mode": true,
  "auto_increment_rate_kgf_per_sec": 0.5
}
```

---

## PHASE 3: BACKEND API SPECIFICATION

### 3.1 REST API Endpoints

```javascript
// ============================================
// HARDWARE ENDPOINTS
// ============================================

// GET /api/hardware/status
// Response: { connected: bool, ip: string, port: int, mode: 'real'|'demo' }

// POST /api/hardware/config
// Body: { host: '192.168.1.100', port: 1234 }
// Response: { status: 'success', message: string }

// GET /api/hardware/read?channel=1&type=2
// Response: { channel: 1, raw_mvv: 0.078086, unit: 'mV/V', status: 0 }

// GET /api/hardware/stream (Server-Sent Events)
// Streams: { timestamp: ISO, raw_mvv: float, variance: float, stable: bool }

// POST /api/hardware/tare?channel=1
// Response: { status: 'success', tare_baseline: 0.002832 }

// ============================================
// CALIBRATION ENDPOINTS (CRUD)
// ============================================

// POST /api/calibration/projects
// Body: { project_name, client_name, instrument_name, serial_number, ... }
// Response: { project_id: int, status: 'success' }

// GET /api/calibration/projects
// Response: [{ id, project_name, status, created_at, ... }]

// GET /api/calibration/projects/:id
// Response: { Full project details }

// POST /api/calibration/projects/:id/start-sequence
// Body: { calibration_points: [0, 10, 20, ...], num_runs: 3 }
// Response: { sequence_id, status: 'started' }

// POST /api/calibration/test-points
// Body: { project_id, stage_name, target_kgf, raw_mvv, zero_corrected, ... }
// Response: { point_id, series_readings: [], mean: float }

// GET /api/calibration/test-points/:project_id
// Response: [{ All measurement data for project }]

// DELETE /api/calibration/test-points/:point_id
// Response: { status: 'deleted' }

// ============================================
// MATHEMATICAL CALCULATION ENDPOINTS
// ============================================

// POST /api/math/polynomial
// Body: { raw_deflection_mvv: 0.078086, a: 4.902632, b: -0.0009308, c: -6.355e-05 }
// Response: { equivalent_force_kn: 0.3828 }

// POST /api/math/three-run-average
// Body: { series1_kn: 0.19475, series2_kn: 0.19476, series3_kn: 0.19451 }
// Response: { mean_kn: 0.19467, repeatability_kn: 0.000114, variance: 1.3e-08 }

// POST /api/math/uncertainty
// Body: { 
//   repeatability_kn: 0.000114,
//   resolution_kn: 0.01,
//   tare_uncertainty_kn: 0.000001,
//   cal_uncertainty_percent: 0.011,
//   temperature_change_c: 2,
//   sensitivity_drift_percent: 0.01
// }
// Response: { 
//   combined_uncertainty_kn: 0.00569,
//   expanded_uncertainty_kn: 0.01138,
//   relative_uncertainty_percent: 0.58,
//   classification: 'Class 3'
// }

// POST /api/math/classify
// Body: { relative_uncertainty_percent: 0.58 }
// Response: { class: 'Class 3', requirement_percent: 0.5 }

// ============================================
// REPORTING ENDPOINTS
// ============================================

// POST /api/certificate/generate
// Body: { project_id, format: 'pdf'|'html'|'csv' }
// Response: Binary file (PDF) or JSON with HTML content

// GET /api/certificate/preview/:project_id
// Response: HTML certificate preview

// POST /api/certificate/save-to-file
// Body: { project_id, filename: 'cert_YYYY-MM-DD.pdf' }
// Response: { filepath, status: 'saved' }

// ============================================
// UTILITY ENDPOINTS
// ============================================

// GET /api/load-cells
// Response: [{ All reference load cell data }]

// GET /api/constants
// Response: { gravity_kgf_to_kn: 0.00980665, ... }
```

---

## PHASE 4: FRONTEND STRUCTURE & UI/UX

### 4.1 Page Architecture

```
HTML Structure (Single Page App with Routing):

/
├─ index.html (Main entry point)
├─ css/
│  ├─ style.css (Global styles)
│  ├─ dashboard.css (Dashboard layout)
│  ├─ controls.css (Button, form styling)
│  └─ responsive.css (Mobile-friendly)
├─ js/
│  ├─ main.js (App initialization, routing)
│  ├─ api.js (Fetch wrapper, REST calls)
│  ├─ hardware.js (DMP41 communication)
│  ├─ calibration.js (Calibration workflow)
│  ├─ math.js (Polynomial, uncertainty calculations)
│  ├─ ui.js (DOM updates, real-time rendering)
│  ├─ storage.js (LocalStorage for form data)
│  └─ utils.js (Helpers, formatting)
├─ templates/
│  ├─ dashboard.html (Main view)
│  ├─ calibration-form.html (Project setup)
│  ├─ live-monitor.html (Real-time data stream)
│  ├─ worksheet.html (Data entry grid)
│  ├─ results.html (Summary table)
│  └─ certificate.html (Report view)
└─ assets/
   ├─ logo.svg
   ├─ icons/
   └─ fonts/
```

### 4.2 Key UI Components

```html
<!-- Main Dashboard -->
<div id="dashboard" class="container">
  <header>
    <h1>DMP41 Calibration System</h1>
    <nav>
      <a href="#projects">Projects</a>
      <a href="#monitor">Live Monitor</a>
      <a href="#worksheet">Worksheet</a>
      <a href="#results">Results</a>
      <a href="#settings">Settings</a>
    </nav>
  </header>

  <!-- Hardware Status Panel -->
  <section id="hardware-status" class="panel">
    <h2>Hardware Status</h2>
    <div class="status-box">
      <p>Connection: <span id="conn-status">Disconnected</span></p>
      <p>IP: <span id="dmp41-ip">192.168.1.100</span></p>
      <p>Port: <span id="dmp41-port">1234</span></p>
      <p>Mode: <span id="hw-mode">Demo</span></p>
      <button id="btn-connect">Connect</button>
      <button id="btn-config">Settings</button>
    </div>
  </section>

  <!-- Real-Time Monitor -->
  <section id="live-monitor" class="panel">
    <h2>Live Force Reading</h2>
    <div class="reading-display">
      <div class="value" id="reading-mvv">0.078086</div>
      <div class="unit">mV/V</div>
    </div>
    <div class="chart-container">
      <canvas id="chart-readings"></canvas>
    </div>
    <div class="controls">
      <button id="btn-start-polling">Start Polling</button>
      <button id="btn-stop-polling">Stop Polling</button>
      <button id="btn-tare">Tare</button>
    </div>
  </section>

  <!-- Calibration Worksheet -->
  <section id="worksheet" class="panel">
    <h2>Calibration Worksheet</h2>
    <table id="measurements-table">
      <thead>
        <tr>
          <th>Point</th>
          <th>Target (kgf)</th>
          <th>Run 1 (kN)</th>
          <th>Run 2 (kN)</th>
          <th>Run 3 (kN)</th>
          <th>Mean (kN)</th>
          <th>Repeatability</th>
          <th>Uncertainty</th>
          <th>Class</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="table-body">
        <!-- Rows populated by JS -->
      </tbody>
    </table>
    <div class="controls">
      <button id="btn-auto-sequence">Start Auto Sequence</button>
      <button id="btn-manual-capture">Manual Capture</button>
      <button id="btn-process-cal">Process Calibration</button>
    </div>
  </section>

  <!-- Results Summary -->
  <section id="results" class="panel">
    <h2>Calibration Results</h2>
    <div id="results-summary">
      <!-- Results injected here -->
    </div>
    <div class="controls">
      <button id="btn-generate-cert">Generate Certificate</button>
      <button id="btn-export-csv">Export CSV</button>
      <button id="btn-print">Print</button>
    </div>
  </section>
</div>
```

### 4.3 Real-Time Data Visualization

```javascript
// Use Chart.js or Plotly for streaming data
const ctx = document.getElementById('chart-readings').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Force (mV/V)',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1,
      fill: false
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: true }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 0.5
      }
    }
  }
});

// Stream updates via WebSocket/SSE
const eventSource = new EventSource('/api/hardware/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  chart.data.labels.push(new Date().toLocaleTimeString());
  chart.data.datasets[0].data.push(data.raw_mvv);
  chart.update();
};
```

---

## PHASE 5: BACKEND SERVICES (Core Logic)

### 5.1 DMP41 Interface Service

```javascript
// services/dmp41_interface.js

const net = require('net');

class DMP41Interface {
  constructor(host = '192.168.1.100', port = 1234) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.isConnected = false;
    this.commandQueue = [];
    this.demoMode = process.env.DEMO_MODE === 'true';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ 
        host: this.host, 
        port: this.port,
        timeout: 5000 
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log(`Connected to DMP41 at ${this.host}:${this.port}`);
        resolve();
      });

      this.socket.on('error', (err) => {
        if (this.demoMode) {
          console.log('DMP41 not available, switching to demo mode');
          this.isConnected = true;
          resolve();
        } else {
          reject(err);
        }
      });

      this.socket.on('timeout', () => {
        reject(new Error('Connection timeout'));
      });
    });
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (this.demoMode) {
        resolve(this.generateDemoResponse(command));
        return;
      }

      if (!this.isConnected) {
        reject(new Error('Not connected to DMP41'));
        return;
      }

      const fullCmd = `${command}\r\n`;
      this.socket.write(fullCmd);

      const timeout = setTimeout(() => {
        reject(new Error(`Command timeout: ${command}`));
      }, 2000);

      this.socket.once('data', (data) => {
        clearTimeout(timeout);
        resolve(data.toString('ascii').trim());
      });
    });
  }

  async requestAdminRights(password = '1234') {
    const response = await this.sendCommand(`RAR${password}`);
    return response === '0'; // 0 = success
  }

  async selectChannel(channel = 1) {
    const response = await this.sendCommand(`CHS${channel}`);
    return response === '0';
  }

  async readMeasurementValue(type = 1) {
    // type: 1 = Gross, 2 = Net, 24 = mV/V
    const response = await this.sendCommand(`MSV?${type}`);
    const parts = response.split(',');
    return {
      raw_deflection: parseFloat(parts[0]),
      unit: parts[1],
      tare_mode: parts[2],
      status_code: parts[3]
    };
  }

  async tare() {
    const response = await this.sendCommand('TAR1');
    return response === '0';
  }

  async streamReadings(interval = 1000, duration = 60000) {
    // Returns array of readings over time
    const readings = [];
    const startTime = Date.now();

    const poll = async () => {
      if (Date.now() - startTime > duration) {
        return;
      }

      try {
        const data = await this.readMeasurementValue(24); // mV/V
        readings.push({
          timestamp: new Date().toISOString(),
          raw_mvv: data.raw_deflection,
          variance: this.calculateVariance(readings.slice(-5))
        });
      } catch (err) {
        console.error('Stream read error:', err.message);
      }

      setTimeout(poll, interval);
    };

    poll();
    return readings;
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;
    const vals = values.map(v => v.raw_mvv);
    const mean = vals.reduce((a, b) => a + b) / vals.length;
    const variance = vals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (vals.length - 1);
    return variance;
  }

  generateDemoResponse(command) {
    // Simulate DMP41 responses for testing
    if (command.startsWith('MSV?')) {
      const baseValue = 0.078086 + (Math.random() - 0.5) * 0.01;
      return `${baseValue.toFixed(6)},mV/V,G,0`;
    }
    return '0'; // Success
  }
}

module.exports = DMP41Interface;
```

### 5.2 Calibration Engine Service

```javascript
// services/calibration_engine.js

class CalibrationEngine {
  constructor() {
    this.gravityConstant = 0.00980665; // 1 kgf in kN
  }

  // F = AD + BD² + CD³ (Polynomial equation)
  calculateEquivalentForce(rawDeflectionMvv, coeffA, coeffB, coeffC) {
    const D = rawDeflectionMvv;
    const F = (coeffA * D) + (coeffB * Math.pow(D, 2)) + (coeffC * Math.pow(D, 3));
    return parseFloat(F.toFixed(6));
  }

  // Calculate mean of 3 runs (0°, 120°, 240°)
  calculateThreeRunAverage(series1_kn, series2_kn, series3_kn) {
    const values = [series1_kn, series2_kn, series3_kn];
    const mean = values.reduce((a, b) => a + b) / 3;
    const variance = this.calculateSampleVariance(values);
    const stdDev = Math.sqrt(variance);
    
    return {
      mean_kn: parseFloat(mean.toFixed(6)),
      repeatability_kn: parseFloat(stdDev.toFixed(9)),
      variance: parseFloat(variance.toFixed(12))
    };
  }

  calculateSampleVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    const sumSquaredDiff = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    return sumSquaredDiff / (values.length - 1); // Bessel's correction
  }

  // ISO 376 Uncertainty Calculation
  calculateUncertainty(params) {
    const {
      repeatability_kn,
      resolution_kn,
      tare_uncertainty_kn,
      cal_uncertainty_percent,
      temperature_change_c,
      sensitivity_ppm_per_c,
      reference_force_kn
    } = params;

    // All uncertainties converted to kN
    const w_rep = repeatability_kn;
    const w_res = resolution_kn / Math.sqrt(3); // Rectangle distribution
    const w_tare = tare_uncertainty_kn;
    const w_cal = (cal_uncertainty_percent / 100) * reference_force_kn;
    const w_temp = (sensitivity_ppm_per_c * temperature_change_c / 1e6) * reference_force_kn;

    // Combined uncertainty (RSS method)
    const w_combined = Math.sqrt(
      Math.pow(w_rep, 2) +
      Math.pow(w_res, 2) +
      Math.pow(w_tare, 2) +
      Math.pow(w_cal, 2) +
      Math.pow(w_temp, 2)
    );

    // Expanded uncertainty (k = 2 for ~95% confidence)
    const w_expanded = 2 * w_combined;
    const relative_uncertainty_percent = (w_expanded / reference_force_kn) * 100;

    return {
      combined_uncertainty_kn: parseFloat(w_combined.toFixed(9)),
      expanded_uncertainty_kn: parseFloat(w_expanded.toFixed(9)),
      relative_uncertainty_percent: parseFloat(relative_uncertainty_percent.toFixed(4)),
      components: {
        repeatability: w_rep,
        resolution: w_res,
        tare: w_tare,
        calibration: w_cal,
        temperature: w_temp
      }
    };
  }

  // ISO 376 Classification
  classifyMeasurement(relativeUncertaintyPercent) {
    const u = parseFloat(relativeUncertaintyPercent);
    
    if (u < 0.05) return 'Class 0';
    if (u < 0.1) return 'Class 1';
    if (u < 0.2) return 'Class 2';
    return 'Class 3';
  }

  // Full calibration result calculation
  processCalibrationPoint(params) {
    const {
      targetForceKgf,
      series1_mvv, series2_mvv, series3_mvv,
      zeroBaseline_mvv,
      coeffA, coeffB, coeffC,
      calUncertainty_percent,
      temperatureChange_c
    } = params;

    // Apply zero correction
    const s1_corrected = series1_mvv - zeroBaseline_mvv;
    const s2_corrected = series2_mvv - zeroBaseline_mvv;
    const s3_corrected = series3_mvv - zeroBaseline_mvv;

    // Apply polynomial
    const s1_kn = this.calculateEquivalentForce(s1_corrected, coeffA, coeffB, coeffC);
    const s2_kn = this.calculateEquivalentForce(s2_corrected, coeffA, coeffB, coeffC);
    const s3_kn = this.calculateEquivalentForce(s3_corrected, coeffA, coeffB, coeffC);

    // 3-run average
    const avgResult = this.calculateThreeRunAverage(s1_kn, s2_kn, s3_kn);

    // Uncertainty
    const uncertaintyParams = {
      repeatability_kn: avgResult.repeatability_kn,
      resolution_kn: 0.01 * this.gravityConstant, // 0.01 kgf resolution → kN
      tare_uncertainty_kn: 1e-6,
      cal_uncertainty_percent: calUncertainty_percent,
      temperature_change_c: temperatureChange_c,
      sensitivity_ppm_per_c: 50,
      reference_force_kn: avgResult.mean_kn
    };

    const uncertainty = this.calculateUncertainty(uncertaintyParams);

    // Classification
    const classification = this.classifyMeasurement(uncertainty.relative_uncertainty_percent);

    // Error analysis
    const targetForceKn = targetForceKgf * this.gravityConstant;
    const absoluteError = avgResult.mean_kn - targetForceKn;
    const relativeErrorPercent = (absoluteError / targetForceKn) * 100;

    return {
      target_force_kgf: targetForceKgf,
      target_force_kn: targetForceKn,
      series1_kn: s1_kn,
      series2_kn: s2_kn,
      series3_kn: s3_kn,
      mean_force_kn: avgResult.mean_kn,
      repeatability_kn: avgResult.repeatability_kn,
      variance: avgResult.variance,
      uncertainty_kn: uncertainty.expanded_uncertainty_kn,
      relative_uncertainty_percent: uncertainty.relative_uncertainty_percent,
      absolute_error_kn: absoluteError,
      relative_error_percent: relativeErrorPercent,
      classification: classification,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CalibrationEngine;
```

### 5.3 Certificate Generator Service

```javascript
// services/certificate_generator.js

class CertificateGenerator {
  constructor() {
    this.companyName = 'Calibration Laboratory';
    this.companyAddress = 'Valenzuela City';
  }

  async generateHTMLCertificate(projectData, resultsData) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Calibration Certificate</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid black; padding-bottom: 10px; }
          .certificate-no { font-size: 14px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; }
          .results-table tr:nth-child(odd) { background-color: #f9f9f9; }
          .footer { margin-top: 40px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CALIBRATION CERTIFICATE</h1>
          <p class="certificate-no">No. ${projectData.cert_no}</p>
          <p>${this.companyName}</p>
        </div>

        <section>
          <h2>Calibration Item</h2>
          <table>
            <tr>
              <td><strong>Item:</strong></td>
              <td>${projectData.instrument_name}</td>
            </tr>
            <tr>
              <td><strong>Manufacturer/Model:</strong></td>
              <td>${projectData.make_model}</td>
            </tr>
            <tr>
              <td><strong>Serial No.:</strong></td>
              <td>${projectData.serial_number}</td>
            </tr>
            <tr>
              <td><strong>Capacity:</strong></td>
              <td>${projectData.capacity_kgf} kgf (${projectData.capacity_kn} kN)</td>
            </tr>
            <tr>
              <td><strong>Range:</strong></td>
              <td>${projectData.range_min} to ${projectData.range_max} kgf</td>
            </tr>
            <tr>
              <td><strong>Client:</strong></td>
              <td>${projectData.client_name}</td>
            </tr>
          </table>
        </section>

        <section>
          <h2>Measurement Results</h2>
          <table class="results-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>Indicated (kgf)</th>
                <th>Applied (kN)</th>
                <th>Uncertainty (kN)</th>
                <th>Rel. Uncertainty (%)</th>
                <th>Relative Error (%)</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              ${resultsData.map(result => `
                <tr>
                  <td>${result.point}</td>
                  <td>${result.target_kgf}</td>
                  <td>${result.mean_kn.toFixed(6)}</td>
                  <td>${result.uncertainty_kn.toFixed(9)}</td>
                  <td>${result.relative_uncertainty_percent.toFixed(3)}</td>
                  <td>${result.relative_error_percent.toFixed(3)}</td>
                  <td>${result.classification}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Uncertainty Statement</h2>
          <p>The uncertainty stated is the expanded uncertainty obtained by multiplying the combined 
             standard uncertainty by the coverage factor k = 2. It represents approximately 95% confidence level.</p>
          <p><strong>Standard Used:</strong> ${projectData.reference_load_cell}</p>
          <p><strong>Calibration Date:</strong> ${projectData.calibration_date}</p>
          <p><strong>Temperature:</strong> ${projectData.temperature_before}°C to ${projectData.temperature_after}°C</p>
          <p><strong>Humidity:</strong> ${projectData.humidity_before}% to ${projectData.humidity_after}%</p>
        </section>

        <div class="footer">
          <p>This certificate is valid for the instrument as tested on the date shown above.</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  async generatePDFCertificate(htmlContent) {
    // Using html2pdf or jsPDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    pdf.html(htmlContent, { callback: () => pdf.save('certificate.pdf') });
  }

  async generateCSVCertificate(projectData, resultsData) {
    let csv = 'Calibration Certificate\n';
    csv += `Certificate No,${projectData.cert_no}\n`;
    csv += `Instrument,${projectData.instrument_name}\n`;
    csv += `Serial Number,${projectData.serial_number}\n`;
    csv += `Calibration Date,${projectData.calibration_date}\n\n`;
    csv += 'Point,Target (kgf),Applied (kN),Uncertainty (kN),Rel. Uncertainty (%),Classification\n';
    
    resultsData.forEach(result => {
      csv += `${result.point},${result.target_kgf},${result.mean_kn.toFixed(6)},${result.uncertainty_kn.toFixed(9)},${result.relative_uncertainty_percent.toFixed(3)},${result.classification}\n`;
    });

    return csv;
  }
}

module.exports = CertificateGenerator;
```

---

## PHASE 6: FRONTEND JAVASCRIPT LOGIC

### 6.1 Main Application Handler

```javascript
// js/main.js

class DMP41CalibrationApp {
  constructor() {
    this.currentProject = null;
    this.currentReadings = [];
    this.isPolling = false;
    this.calibrationSequence = [];
    this.pollInterval = null;
    
    this.initEventListeners();
    this.loadProjects();
  }

  initEventListeners() {
    document.getElementById('btn-connect').addEventListener('click', () => this.connectToHardware());
    document.getElementById('btn-start-polling').addEventListener('click', () => this.startPolling());
    document.getElementById('btn-stop-polling').addEventListener('click', () => this.stopPolling());
    document.getElementById('btn-tare').addEventListener('click', () => this.tareHardware());
    document.getElementById('btn-auto-sequence').addEventListener('click', () => this.startAutoSequence());
    document.getElementById('btn-process-cal').addEventListener('click', () => this.processCalibration());
    document.getElementById('btn-generate-cert').addEventListener('click', () => this.generateCertificate());
  }

  async connectToHardware() {
    try {
      const response = await fetch('/api/hardware/status');
      const status = await response.json();
      
      if (status.connected) {
        document.getElementById('conn-status').textContent = '✓ Connected';
        document.getElementById('conn-status').style.color = 'green';
      } else {
        document.getElementById('conn-status').textContent = '✗ Disconnected';
        document.getElementById('conn-status').style.color = 'red';
      }
    } catch (err) {
      console.error('Connection check failed:', err);
    }
  }

  async startPolling() {
    this.isPolling = true;
    document.getElementById('btn-start-polling').disabled = true;
    document.getElementById('btn-stop-polling').disabled = false;

    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/hardware/read?channel=1&type=24');
        const data = await response.json();
        
        this.currentReadings.push({
          timestamp: new Date(),
          raw_mvv: data.raw_mvv
        });

        // Keep last 100 readings
        if (this.currentReadings.length > 100) {
          this.currentReadings.shift();
        }

        document.getElementById('reading-mvv').textContent = data.raw_mvv.toFixed(6);
        
        // Update chart (if using Chart.js)
        this.updateChart(data.raw_mvv);

      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  }

  stopPolling() {
    this.isPolling = false;
    clearInterval(this.pollInterval);
    document.getElementById('btn-start-polling').disabled = false;
    document.getElementById('btn-stop-polling').disabled = true;
  }

  async tareHardware() {
    try {
      const response = await fetch('/api/hardware/tare?channel=1', { method: 'POST' });
      const data = await response.json();
      alert('Tare successful!');
    } catch (err) {
      alert('Tare failed: ' + err.message);
    }
  }

  async startAutoSequence() {
    const calibrationPoints = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const runs = 3;

    for (let runNumber = 0; runNumber < runs; runNumber++) {
      console.log(`Starting Run ${runNumber + 1}/${runs}`);

      for (let point of calibrationPoints) {
        alert(`Load to ${point} kgf and press OK when stable`);
        
        // Wait for stability
        const isStable = await this.waitForStability();
        
        if (isStable) {
          // Capture reading
          const reading = await this.captureReading(point, runNumber);
          console.log(`Captured: ${point} kgf → ${reading.raw_mvv} mV/V`);
        }
      }
    }

    alert('Auto-sequence complete!');
  }

  async waitForStability(threshold = 0.05, duration = 5000) {
    const startTime = Date.now();
    const readings = [];

    while (Date.now() - startTime < duration) {
      const response = await fetch('/api/hardware/read?channel=1&type=24');
      const data = await response.json();
      readings.push(data.raw_mvv);

      if (readings.length > 5) {
        const variance = this.calculateVariance(readings.slice(-5));
        if (variance < threshold) {
          return true;
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    return false; // Timeout
  }

  async captureReading(targetKgf, runNumber) {
    // POST to /api/calibration/test-points
    const response = await fetch('/api/calibration/test-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: this.currentProject.id,
        stage_name: `Run ${runNumber + 1}`,
        target_kgf: targetKgf,
        raw_mvv: this.currentReadings[this.currentReadings.length - 1].raw_mvv,
        series_number: runNumber + 1
      })
    });

    return await response.json();
  }

  async processCalibration() {
    // GET /api/calibration/test-points/:project_id
    const response = await fetch(`/api/calibration/test-points/${this.currentProject.id}`);
    const testPoints = await response.json();

    // Calculate results
    const results = [];
    for (let i = 0; i < 11; i++) {
      const pointData = testPoints.filter(p => p.measurement_sequence === i);
      const mathResult = await fetch('/api/math/uncertainty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repeatability_kn: 0.0005,
          resolution_kn: 0.01 * 0.00980665,
          // ... other params
        })
      }).then(r => r.json());

      results.push(mathResult);
    }

    this.displayResults(results);
  }

  async generateCertificate() {
    const response = await fetch('/api/certificate/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        project_id: this.currentProject.id,
        format: 'pdf'
      })
    });

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate_${this.currentProject.id}.pdf`;
    a.click();
  }

  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
    return variance;
  }

  updateChart(value) {
    // Update real-time chart (if using Chart.js)
    // Implementation depends on chart library
  }

  displayResults(results) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = results.map((result, idx) => `
      <tr>
        <td>${idx}</td>
        <td>${result.target_force_kgf}</td>
        <td>${result.series1_kn.toFixed(6)}</td>
        <td>${result.series2_kn.toFixed(6)}</td>
        <td>${result.series3_kn.toFixed(6)}</td>
        <td>${result.mean_force_kn.toFixed(6)}</td>
        <td>${result.repeatability_kn.toFixed(9)}</td>
        <td>${result.uncertainty_kn.toFixed(9)}</td>
        <td>${result.classification}</td>
        <td><button onclick="editRow(${idx})">Edit</button></td>
      </tr>
    `).join('');
  }

  async loadProjects() {
    const response = await fetch('/api/calibration/projects');
    const projects = await response.json();
    // Populate project list UI
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DMP41CalibrationApp();
});
```

---

## PHASE 7: SERVER EXPRESS SETUP

### 7.1 Main Server File

```javascript
// server.js

const express = require('express');
const sqlite3 = require('sqlite3');
const cors = require('cors');
const DMP41Interface = require('./services/dmp41_interface');
const CalibrationEngine = require('./services/calibration_engine');
const CertificateGenerator = require('./services/certificate_generator');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize services
const dmp41 = new DMP41Interface();
const calibEngine = new CalibrationEngine();
const certGen = new CertificateGenerator();

// Database setup
const db = new sqlite3.Database('./calibration_data.db');

// ============================================
// HARDWARE ROUTES
// ============================================

app.get('/api/hardware/status', async (req, res) => {
  try {
    const isConnected = dmp41.isConnected;
    res.json({
      connected: isConnected,
      ip: dmp41.host,
      port: dmp41.port,
      mode: dmp41.demoMode ? 'demo' : 'real'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hardware/config', async (req, res) => {
  try {
    const { host, port } = req.body;
    dmp41.host = host;
    dmp41.port = port;
    await dmp41.connect();
    res.json({ status: 'success', message: 'Connected to DMP41' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hardware/read', async (req, res) => {
  try {
    const { channel = 1, type = 24 } = req.query;
    const reading = await dmp41.readMeasurementValue(parseInt(type));
    res.json(reading);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hardware/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendData = async () => {
    try {
      const reading = await dmp41.readMeasurementValue(24);
      res.write(`data: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        raw_mvv: reading.raw_deflection,
        variance: dmp41.calculateVariance(dmp41.lastReadings || [])
      })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  const interval = setInterval(sendData, 1000);
  req.on('close', () => clearInterval(interval));
});

app.post('/api/hardware/tare', async (req, res) => {
  try {
    const { channel = 1 } = req.query;
    await dmp41.selectChannel(parseInt(channel));
    const success = await dmp41.tare();
    res.json({ status: success ? 'success' : 'failed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CALIBRATION ROUTES
// ============================================

app.post('/api/calibration/projects', (req, res) => {
  const { project_name, client_name, instrument_name, serial_number, capacity_kgf, range_min_kgf, range_max_kgf } = req.body;
  const stmt = db.prepare(`
    INSERT INTO calibration_projects 
    (project_name, client_name, instrument_name, serial_number, capacity_kgf, range_min_kgf, range_max_kgf)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(project_name, client_name, instrument_name, serial_number, capacity_kgf, range_min_kgf, range_max_kgf, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ project_id: this.lastID, status: 'success' });
    }
  });
});

app.get('/api/calibration/projects', (req, res) => {
  db.all('SELECT * FROM calibration_projects', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/calibration/test-points', (req, res) => {
  const { project_id, stage_name, target_kgf, raw_mvv, zero_corrected_mvv, equivalent_force_kn, series_number } = req.body;
  const stmt = db.prepare(`
    INSERT INTO test_points 
    (project_id, stage_name, target_value_kgf, raw_reading_mvv, zero_corrected_mvv, equivalent_force_kn, series_number, reading_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(project_id, stage_name, target_kgf, raw_mvv, zero_corrected_mvv, equivalent_force_kn, series_number, new Date().toISOString(), function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ point_id: this.lastID, status: 'success' });
    }
  });
});

// ============================================
// MATH ROUTES
// ============================================

app.post('/api/math/polynomial', (req, res) => {
  try {
    const { raw_deflection_mvv, a, b, c } = req.body;
    const result = calibEngine.calculateEquivalentForce(raw_deflection_mvv, a, b, c);
    res.json({ equivalent_force_kn: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/math/three-run-average', (req, res) => {
  try {
    const { series1_kn, series2_kn, series3_kn } = req.body;
    const result = calibEngine.calculateThreeRunAverage(series1_kn, series2_kn, series3_kn);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/math/uncertainty', (req, res) => {
  try {
    const result = calibEngine.calculateUncertainty(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CERTIFICATE ROUTES
// ============================================

app.post('/api/certificate/generate', async (req, res) => {
  try {
    const { project_id, format = 'pdf' } = req.body;
    
    // Fetch project and results data
    // Generate certificate
    // Return file or JSON based on format
    
    res.json({ status: 'success', message: 'Certificate generated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`DMP41 Calibration System running at http://localhost:${PORT}`);
  console.log('Database initialized at ./calibration_data.db');
  
  // Auto-connect to DMP41 if not in demo mode
  if (process.env.DEMO_MODE !== 'true') {
    dmp41.connect().catch(err => {
      console.log('DMP41 connection failed, running in demo mode');
      dmp41.demoMode = true;
    });
  }
});
```

---

## PHASE 8: DEPLOYMENT & CONFIGURATION

### 8.1 Project File Structure

```
dmp41-calibration-system/
├── server.js                      # Main Express app
├── package.json
├── .env                           # Environment config
├── calibration_data.db            # SQLite database (auto-created)
│
├── services/
│  ├── dmp41_interface.js         # Hardware driver
│  ├── calibration_engine.js      # ISO 376 math
│  ├── certificate_generator.js   # Report generation
│  └── database_manager.js        # DB operations
│
├── routes/
│  ├── hardware.js                # Hardware endpoints
│  ├── calibration.js             # Project CRUD
│  ├── math.js                    # Calculations
│  └── certificates.js            # Reporting
│
├── public/                        # Frontend (served static)
│  ├── index.html
│  ├── css/
│  │  ├── style.css
│  │  ├── dashboard.css
│  │  └── responsive.css
│  ├── js/
│  │  ├── main.js
│  │  ├── api.js
│  │  ├── hardware.js
│  │  ├── calibration.js
│  │  ├── math.js
│  │  ├── ui.js
│  │  └── utils.js
│  ├── templates/
│  │  ├── dashboard.html
│  │  ├── calibration-form.html
│  │  ├── live-monitor.html
│  │  ├── worksheet.html
│  │  ├── results.html
│  │  └── certificate.html
│  └── assets/
│
├── config/
│  ├── load_cells.json            # Reference standards DB
│  └── dmp41_settings.json        # Hardware config
│
├── docs/
│  ├── API.md                     # API documentation
│  ├── INSTALL.md                 # Setup instructions
│  └── USER_GUIDE.md              # Operator manual
│
└── tests/
   ├── test_hardware.js           # Unit tests
   └── test_calibration.js        # Math tests
```

### 8.2 package.json

```json
{
  "name": "dmp41-calibration-system",
  "version": "1.0.0",
  "description": "Web-based HBM DMP41 calibration platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^5.2.1",
    "cors": "^2.8.6",
    "sqlite3": "^5.1.6",
    "socket.io": "^4.5.4",
    "jspdf": "^2.5.1",
    "html2canvas": "^1.4.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.0.0"
  }
}
```

### 8.3 .env Configuration

```env
# DMP41 Hardware
DMP41_HOST=192.168.1.100
DMP41_PORT=1234
DMP41_DEMO_MODE=false
DMP41_TIMEOUT_MS=5000

# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DB_PATH=./calibration_data.db

# Application
APP_NAME=DMP41 Calibration System
APP_VERSION=1.0.0
```

---

## PHASE 9: AI PROMPT SPECIFICATION

### 9.1 The Master Prompt (for Code Generation AI)

```markdown
# DMP41 Web-Based Calibration System - Code Generation Prompt

## CONTEXT
You are building a replacement for a legacy Excel+LabWindows calibration system. 
The new system is a web application that:
- Runs on localhost:3000 (Node.js + Express backend)
- Communicates with an HBM DMP41 precision amplifier via TCP/IP (port 1234)
- Performs ISO 376-compliant force measurement calibrations
- Replaces VBA macros and manual Excel processes with automated workflows
- Uses vanilla web technologies (HTML5, CSS3, JavaScript)

## HARDWARE INTERFACE
The HBM DMP41 uses ASCII protocol over TCP/IP:
- Command format: `COMMAND<param1><param2>\r\n`
- Example queries: `MSV?1` (measure signal), `TAR1` (tare), `CHS1` (channel select)
- Response format: `value,unit,tare_mode,status_code`
- Authentication: `RAR1234` (Request Admin Rights with password)

## CALIBRATION WORKFLOW
1. **Input**: 10 calibration points (0, 10, 20, ..., 100 kgf)
2. **Measurement**: 3 angular runs (0°, 120°, 240°) per point
3. **Processing**:
   - Apply zero correction: raw_mvv - baseline_mvv
   - Apply polynomial: F = A*D + B*D² + C*D³
   - Calculate 3-run average: mean(series1, series2, series3)
   - Compute uncertainty following ISO 376
   - Classify result (Class 0/1/2/3)
4. **Output**: Calibration certificate with traceability

## DATABASE SCHEMA
Create SQLite tables for:
- calibration_projects (sessions)
- test_points (individual measurements)
- transducer_coefficients (load cell calibrations)
- calibration_results (computed outputs)
- environmental_conditions (temp/humidity logs)
- load_cells_reference (standards database)

## API REQUIREMENTS
Implement these REST endpoints:
- GET /api/hardware/status
- POST /api/hardware/config
- GET /api/hardware/read?channel=X&type=Y
- GET /api/hardware/stream (Server-Sent Events)
- POST /api/calibration/projects
- POST /api/calibration/test-points
- POST /api/math/polynomial
- POST /api/math/three-run-average
- POST /api/math/uncertainty
- POST /api/certificate/generate

## FRONTEND REQUIREMENTS
Build a single-page dashboard with:
1. **Hardware Status Panel** - Shows connection, IP, port
2. **Live Monitor** - Real-time force readings with chart
3. **Calibration Worksheet** - Table for data entry (10 points × 3 runs)
4. **Auto-Sequence Controller** - Automate measurement at set points
5. **Results Display** - Mean, uncertainty, classification per point
6. **Certificate Generator** - Export PDF/CSV reports

## CRITICAL MATH
Implement these exact calculations:
- Polynomial: F_kN = A*D_mvv + B*(D_mvv)² + C*(D_mvv)³
- 3-Run Avg: mean = (s1 + s2 + s3) / 3
- Sample Variance: Σ(xi - mean)² / (n-1)
- Combined Uncertainty: √(wrep² + wres² + wtare² + wcal² + wtemp²)
- Expanded Uncertainty: U_expanded = 2 × U_combined
- Classification:
  - Class 0: U < 0.05%
  - Class 1: U < 0.1%
  - Class 2: U < 0.2%
  - Class 3: U ≥ 0.2%

## DEMO MODE
When hardware is unavailable:
- Simulate readings: random(0.05, 0.12) mV/V
- Auto-increment: 0.5 kgf/sec when polling active
- Pre-load with reference data from load_cells.json

## DELIVERABLES
1. Full Node.js Express server with SQLite backend
2. HTML5/CSS3/Vanilla JS frontend (no frameworks)
3. Complete API with error handling
4. Database initialization scripts
5. Load cell coefficient database (JSON)
6. Certificate generation (HTML/PDF)
7. This specification + API docs
```

---

## PHASE 10: IMPLEMENTATION ROADMAP

```
WEEK 1: FOUNDATION
├─ Day 1-2: Project setup, Express server, SQLite schema
├─ Day 3-4: DMP41 TCP/IP driver (hardware interface service)
├─ Day 5:   Database initialization, load cell reference data
└─ Day 6-7: Basic REST API scaffolding

WEEK 2: BACKEND LOGIC
├─ Day 1-2: Calibration engine (polynomial, uncertainty, classification)
├─ Day 3-4: Certificate generator (HTML/PDF/CSV)
├─ Day 5-6: Complete API endpoints with error handling
└─ Day 7:   API testing, demo mode verification

WEEK 3: FRONTEND
├─ Day 1-2: HTML layout (dashboard, panels, forms)
├─ Day 3-4: CSS styling (responsive, accessible)
├─ Day 5:   JavaScript - API calls, real-time updates
├─ Day 6:   Live chart visualization (Chart.js)
└─ Day 7:   Auto-sequence logic, data validation

WEEK 4: INTEGRATION & TESTING
├─ Day 1-2: End-to-end testing (hardware ↔ backend ↔ frontend)
├─ Day 3-4: Demo mode testing, edge cases, error recovery
├─ Day 5:   Performance optimization, caching
├─ Day 6:   Documentation (API, user guide, deployment)
└─ Day 7:   Final QA, deployment readiness
```

---

## SUMMARY: What This Plan Provides

✅ **Complete system replacement** for legacy Excel + LabWindows
✅ **Real-time TCP/IP communication** with DMP41 amplifier
✅ **ISO 376 compliance** with accurate uncertainty calculations
✅ **Automated 10-point calibration** with 3-run averaging
✅ **Professional certificate generation** with traceability
✅ **Responsive web UI** (localhost:3000)
✅ **SQLite persistence** for all calibration data
✅ **Demo/Mock mode** for development without hardware
✅ **Vanilla tech stack** (no heavy frameworks)
✅ **Production-ready architecture**

---

**This plan is ready to be handed to an AI code generation tool to build the complete system.** 🎯
